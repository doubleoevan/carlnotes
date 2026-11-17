// measures a clean replay of ten Scans with the real Journal writes and an independent LLM pair judge
import { type FileHandle, open, writeFile } from "node:fs/promises"
import { db } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import type { EmbeddedTopicMemoryWrite, TopicMemoryMergedPair } from "@carlnotes/pipeline/applyTopicMemoryWrite"
import { repairTopicMemoryClaims } from "@carlnotes/pipeline/repairTopicMemoryClaims"
import { checkTopicMemoryClaims, type TopicMemoryClaimCounts } from "@carlnotes/pipeline/topicMemoryClaimReview"
import { loadTopicMemoryFindings } from "@carlnotes/pipeline/topicMemoryEvidence"
import { saveTopicMemoryUpdates } from "@carlnotes/pipeline/topicMemoryWrites"
import { prepareTopicMemoryWrites } from "@carlnotes/pipeline/updateTopicMemories"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { and, eq, sql } from "drizzle-orm"
import { loadTopicMemorySnapshot, type TopicMemorySnapshot } from "./topicMemoriesSnapshot"
import { type EvaluatedTopicMemory, judgeTopicMemories, toThresholdMetrics } from "./topicMemoryPairJudge"

const [stage, snapshotPath, pairAuditPath] = Bun.argv.slice(2)
type ReplayResult = {
	before: EvaluatedTopicMemory[]
	after: EvaluatedTopicMemory[]
	samples: TopicMemoryMergedPair[]
	nonemptyBrews: number
	claimChecks: TopicMemoryClaimCounts
	compoundTopicMemories: number
	compoundRepair: { flagged: number; repaired: number }
}
class EvalSetupError extends Error {}

// validate the command and reserve the audit path before any paid replay
if (!snapshotPath || (stage !== "snapshot" && stage !== "replay")) {
	throw new Error("Expected snapshot or replay, followed by a local snapshot file path")
}
let pairAudit: FileHandle | undefined
try {
	if (stage === "snapshot") {
		const topicCount = pairAuditPath ? Number(pairAuditPath) : 5
		if (!Number.isInteger(topicCount) || topicCount < 5) {
			throw new EvalSetupError("Snapshot Topic count must be an integer of at least five")
		}
		const snapshot = await loadTopicMemorySnapshot(topicCount)
		await writeFile(snapshotPath, JSON.stringify(snapshot), { mode: 0o600, flag: "wx" })
		console.log(
			JSON.stringify(
				snapshot.map(({ topicId, name, isPublic, previouslyActive, brews }) => ({
					topicId,
					name: isPublic ? name : undefined,
					previouslyActive,
					brews: brews.filter(({ evidence }) => evidence).length,
					publicFindings: brews.reduce((sum, scan) => sum + (scan.evidence?.length ?? 0), 0),
				})),
			),
		)
	} else {
		// refuse to replace an existing audit before paying to generate another one
		pairAudit = pairAuditPath ? await open(pairAuditPath, "wx", 0o600) : undefined
		await evaluateReplay({ snapshotPath, pairAudit })
	}
} catch (error) {
	// provider messages can contain credentials or response headers
	const failure = error as {
		name?: string
		statusCode?: number
		code?: string
		cause?: { code?: string; column?: string }
	}
	console.error("Topic memories eval failed", {
		name: failure.name,
		statusCode: failure.statusCode,
		code: failure.code ?? failure.cause?.code,
		column: failure.cause?.column,
		setup: error instanceof EvalSetupError ? error.message : undefined,
	})
	process.exitCode = 1
} finally {
	await pairAudit?.close()
	await db.$client.end()
}

async function evaluateReplay({
	snapshotPath,
	pairAudit,
}: {
	snapshotPath: string
	pairAudit?: FileHandle
}): Promise<void> {
	// follow the eval convention and measure the templates in this checkout
	delete Bun.env.LANGFUSE_PUBLIC_KEY
	const apiKey = Bun.env.LITELLM_PUBLIC_KEY
	if (!apiKey) {
		throw new EvalSetupError("LITELLM_PUBLIC_KEY must route the isolated eval's model calls")
	}
	const {
		rows: [database],
	} = await db.execute<{ name: string }>(sql`select current_database() as name`)
	if (!database?.name.startsWith("journal_eval_")) {
		throw new EvalSetupError("Replay requires a disposable migrated database named journal_eval_*")
	}
	const snapshot = (await Bun.file(snapshotPath).json()) as TopicMemorySnapshot[]
	const failedTopics: string[] = []
	const results = await runWithConcurrency(snapshot, 4, async (topic) => {
		try {
			const { before, after, samples, nonemptyBrews, claimChecks, compoundTopicMemories, compoundRepair } =
				await replayTopic(topic, apiKey)
			const { pairs, ...judged } = await judgeTopicMemories({ before, after, apiKey })
			const report = {
				topicId: topic.topicId,
				name: topic.isPublic ? topic.name : undefined,
				previouslyActive: topic.previouslyActive,
				brews: 10,
				nonemptyBrews,
				claimChecks,
				compoundTopicMemories,
				compoundRepair,
				...judged,
			}
			console.log(JSON.stringify({ topic: report }))
			return { report, samples, pairs, topic }
		} catch (error) {
			// keep graded Topics and report any Topic the judge or proxy could not finish
			failedTopics.push(topic.topicId)
			const { name, statusCode } = error as { name?: string; statusCode?: number }
			console.log(JSON.stringify({ failedTopic: topic.topicId, name, statusCode }))
			return null
		}
	})
	const reports = results.filter((result) => result !== null)
	if (pairAudit) {
		const records = reports.flatMap(({ topic, pairs }) =>
			pairs.map((pair) => ({ topic: topic.name, topicId: topic.topicId, isPublic: topic.isPublic, ...pair })),
		)
		await pairAudit.writeFile(JSON.stringify(records, null, 2))
	}
	const thresholds = reports[0]?.report.before.thresholds.map(({ threshold }, index) => {
		const totals = reports.reduce(
			(counts, { report }) => {
				const metrics = report.before.thresholds[index]
				return {
					truePositive: counts.truePositive + (metrics?.truePositive ?? 0),
					falsePositive: counts.falsePositive + (metrics?.falsePositive ?? 0),
					falseNegative: counts.falseNegative + (metrics?.falseNegative ?? 0),
				}
			},
			{ truePositive: 0, falsePositive: 0, falseNegative: 0 },
		)
		return { threshold, ...toThresholdMetrics(totals) }
	})
	// sample only public Topics for the shareable report
	const mergedPairs = reports
		.filter(({ topic }) => topic.isPublic)
		.flatMap(({ report, samples }) => samples.map((pair) => ({ topic: report.name, ...pair })))

		.slice(0, 5)
	const pipeline = toThresholdMetrics(
		reports.reduce(
			(totals, { report }) => ({
				truePositive: totals.truePositive + report.pipeline.truePositive,
				falsePositive: totals.falsePositive + report.pipeline.falsePositive,
				falseNegative: totals.falseNegative + report.pipeline.falseNegative,
			}),
			{ truePositive: 0, falsePositive: 0, falseNegative: 0 },
		),
	)
	const claimChecks = reports.reduce(
		(totals, { report }) => ({
			checked: totals.checked + report.claimChecks.checked,
			split: totals.split + report.claimChecks.split,
			rejected: totals.rejected + report.claimChecks.rejected,
			compound: totals.compound + report.compoundTopicMemories,
			active: totals.active + report.after.memoryCount,
		}),
		{ checked: 0, split: 0, rejected: 0, compound: 0, active: 0 },
	)
	console.log(JSON.stringify({ pipeline, claimChecks, thresholds, mergedPairs, failedTopics }))
	if (failedTopics.length > 0) {
		process.exitCode = 1
	}
}

async function replayTopic(topic: TopicMemorySnapshot, apiKey: string): Promise<ReplayResult> {
	// use a fresh Topic identity and keep the original scan order for exact replacement chronology
	const ownerId = crypto.randomUUID()
	const topicId = crypto.randomUUID()
	const username = `jr${ownerId.replaceAll("-", "").slice(0, 12)}`
	await db.insert(users).values({
		id: ownerId,
		name: "Journal replay",
		email: `${ownerId}@example.test`,
		username,
		usernameNormalized: username,
	})
	await db
		.insert(topics)
		.values({ id: topicId, ownerId, name: topic.name, prompt: topic.prompt ?? "", visibility: "private" })
	const proposals: EmbeddedTopicMemoryWrite[] = []
	const writeResults = new Map<EmbeddedTopicMemoryWrite, string>()
	const samples: TopicMemoryMergedPair[] = []
	const claimChecks: TopicMemoryClaimCounts = { checked: 0, split: 0, rejected: 0 }
	let nonemptyBrews = 0
	const signal = new AbortController().signal
	try {
		for (const scan of topic.brews) {
			const scanId = `${topicId}:${scan.id}`
			const scanStartedAt = new Date(scan.startedAt)
			await db.insert(scans).values({ id: scanId, topicId, ownerId, startedAt: scanStartedAt, status: "succeeded" })
			if (!scan.evidence) {
				continue
			}

			// replay stored public Finding text and vectors, including successful Scans that kept nothing
			await insertReplayEvidence({ scanId, topicId, evidence: scan.evidence })
			if (scan.evidence.length) {
				nonemptyBrews++
			}
			const input = { scanId, topicId, scanStartedAt, signal }
			const evidence = await loadTopicMemoryFindings(scanId, topicId)
			const { writes, counts } = await prepareTopicMemoryWrites({ ...input, findings: evidence, litellmApiKey: apiKey })
			claimChecks.checked += counts.checked
			claimChecks.split += counts.split
			claimChecks.rejected += counts.rejected
			proposals.push(...writes)
			await saveTopicMemoryUpdates({
				...input,
				writes,
				writeResults,
				mergedPairs: samples,
			})
			console.log(
				JSON.stringify({
					replayed: topic.topicId,
					devScanId: scan.id,
					findings: evidence.length,
					proposals: writes.length,
				}),
			)
		}

		// exact replacements can change which rows are active, so read the actual final Journal
		const readSurvivors = () =>
			db
				.select({
					id: topicMemories.id,
					text: topicMemories.text,
					embedding: topicMemories.embedding,
					factDate: topicMemories.factDate,
					person: topicMemories.person,
					replacedById: topicMemories.replacedById,
					status: topicMemories.status,
				})
				.from(topicMemories)
				.where(
					and(eq(topicMemories.topicId, topicId), eq(topicMemories.isAtomic, true), eq(topicMemories.status, "active")),
				)
				.orderBy(topicMemories.id)

		const before = proposals.map((proposal) => {
			const { text, embedding, factDate, person } = proposal
			const memoryId = writeResults.get(proposal)
			return { text, embedding, factDate, person, memoryId }
		})
		const survivors = await readSurvivors()
		// regrade stored topic memories with the premium model, independently of the write gate
		const verdicts = await checkTopicMemoryClaims({
			claims: survivors,
			litellmApiKey: apiKey,
			signal,
			usePremiumModel: true,
		})
		const compoundIds = survivors.flatMap(({ id }, index) => (verdicts[index] === "compound" ? [id] : []))
		const repair = compoundIds.length
			? await repairTopicMemoryClaims({
					litellmApiKey: apiKey,
					signal,
					compoundIds,
					scope: { topicId },
				})
			: undefined
		const after = repair ? await readSurvivors() : survivors
		const repaired = (repair?.rewritten ?? 0) + (repair?.split ?? 0)
		return {
			before,
			after,
			samples,
			nonemptyBrews,
			claimChecks,
			compoundTopicMemories: compoundIds.length - repaired,
			compoundRepair: { flagged: compoundIds.length, repaired },
		}
	} finally {
		// fixture identities own all copied scans and memories
		await db.delete(topics).where(eq(topics.id, topicId))
		await db.delete(users).where(eq(users.id, ownerId))
		await db.delete(resources).where(sql`${resources.url} like ${`https://example.test/journal-replay/${topicId}/%`}`)
	}
}

async function insertReplayEvidence({
	scanId,
	topicId,
	evidence,
}: {
	scanId: string
	topicId: string
	evidence: NonNullable<TopicMemorySnapshot["brews"][number]["evidence"]>
}): Promise<void> {
	if (!evidence.length) {
		return
	}

	// preserve the original order to keep Finding groups and draft order stable
	const rows = evidence.map(({ title, snippet, description, embedding, embeddingModel }, index) => ({
		resource: {
			id: crypto.randomUUID(),
			url: `https://example.test/journal-replay/${topicId}/${scanId}/${index}`,
			kind: "read" as const,
			title,
			snippet,
			embedding,
			embeddingModel,
		},
		finding: { topicId, scanId, relevanceScore: 1 - index / 100, relevanceExplanation: description },
	}))
	await db.insert(resources).values(rows.map(({ resource }) => resource))
	await db.insert(findings).values(rows.map(({ resource, finding }) => ({ ...finding, resourceId: resource.id })))
}
