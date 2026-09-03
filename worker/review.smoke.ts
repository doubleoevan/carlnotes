// a live smoke test for one real Scan on a busy feed, reporting time taken, limit overshoot, and whether it kept its
// best survivors. run it with: bun run smoke:review. each run resets its feed, so two REVIEW_CONCURRENCY values compare fairly
import { cosineSimilarity } from "ai"
import { and, eq, inArray, isNotNull, like } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, scans, sources, topics, users } from "../db/schema"
import { embedVector } from "./models"
import { loadScan } from "./scan"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import { finishScan, ingestForScan, reviewForScan } from "./workflows/run-topic-scan-activities"

// a real feed that reliably carries more entries than the limit admits, plus a matching topic context
const FEED_URL = "https://simonwillison.net/atom/everything/"
const FEED_HOST_PATTERN = "%simonwillison.net%"
const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

// the same instruction wrapper the relevance gate embeds its query side with
const EMBED_QUERY_INSTRUCTION = "Given a topic's interest description, retrieve web resources relevant to it"

// the two knobs under test, read the same way review reads them, so the report names the run's real settings
const REVIEW_CONCURRENCY = Number(Bun.env.REVIEW_CONCURRENCY ?? "4")
const MAX_SCORED_RESOURCES_PER_SCAN = Number(Bun.env.MAX_SCORED_RESOURCES_PER_SCAN ?? "30")

// clear every cached field on the topic feed's Resources, so the next run redoes all of its work
async function resetFeedResources(): Promise<number> {
	const resetResources = await db
		.update(resources)
		.set({
			contentKey: null,
			contentBytes: null,
			etag: null,
			lastModified: null,
			embedding: null,
			embeddingModel: null,
			contentHash: null,
		})
		.where(like(resources.url, FEED_HOST_PATTERN))
		.returning({ id: resources.id })
	return resetResources.length
}

// one id per run, so fixture rows never collide with an earlier run's
const runId = Date.now()

// seed a fake owner, a topic whose context matches the feed, and the RSS source
async function seedTestData(): Promise<{ topicId: string; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic, source, scan, and findings
	const [user] = await db
		.insert(users)
		.values({
			name: "review-smoke",
			email: `review-smoke+${runId}@example.test`,
			username: `review-smoke-${runId}`,
			usernameNormalized: `reviewsmoke${runId}`,
		})
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// a topic whose context matches the feed, so plenty of resources clear the relevance gate
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: `review smoke c${REVIEW_CONCURRENCY}`, prompt: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}

	// an RSS source with no API key pointing at the feed
	await db.insert(sources).values({ topicId: topic.id, kind: "rss", config: { url: FEED_URL }, status: "ready" })

	// a completed Scan saved with finishedAt now
	await db.insert(scans).values({ topicId: topic.id, ownerId: user.id, status: "succeeded", finishedAt: new Date() })
	return { topicId: topic.id, userId: user.id }
}

// one resource as the ranking saw it, with what admission and the paid pass each did to it
type RankedResource = {
	id: string
	similarity: number
	isAdmitted: boolean
	isScored: boolean
}

// every Resource this Scan considered, with its similarity to the topic context recomputed
async function loadResourceRanking(
	topicId: string,
	admittedResourceIds: string[],
	scoredResourceIds: string[],
	discoveredUrls: string[],
): Promise<{ rankedResources: RankedResource[]; findingCount: number }> {
	// the topic-context embedding, wrapped as the query side exactly as the gate wraps it
	const contextEmbedding = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${TOPIC_CONTEXT}`)

	// what the review reported it let through and what it paid for, so neither is guessed at here
	const admittedIds = new Set(admittedResourceIds)
	const scoredIds = new Set(scoredResourceIds)
	const findingRows = await db
		.select({ resourceId: findings.resourceId })
		.from(findings)
		.where(eq(findings.topicId, topicId))

	// only the Resources this Scan actually ingested
	const resourceRows = await db
		.select({ id: resources.id, embedding: resources.embedding })
		.from(resources)
		.where(and(inArray(resources.url, discoveredUrls), isNotNull(resources.embedding)))

	// score each resource the way the ranking did, tagging what admission let through and what won a paid slot
	const rankedResources = resourceRows.map((resourceRow) => ({
		id: resourceRow.id,
		similarity: cosineSimilarity(resourceRow.embedding as number[], contextEmbedding),
		isAdmitted: admittedIds.has(resourceRow.id),
		isScored: scoredIds.has(resourceRow.id),
	}))

	// the finding count comes back too, printed next to the Scan's own kept count so a mismatch is visible
	return { rankedResources, findingCount: findingRows.length }
}

// the admitted rankedResources that outrank the worst purchase and were skipped anyway. a resource the
// dedupe or the relevance gate never admitted is that filter's decision, and its own tallies report it
function toRankingViolations(rankedResources: RankedResource[]): RankedResource[] {
	const scoredSimilarities = rankedResources
		.filter((resource) => resource.isScored)
		.map((resource) => resource.similarity)
	const lowestScoredSimilarity = Math.min(...scoredSimilarities)
	return rankedResources
		.filter((resource) => resource.isAdmitted && !resource.isScored && resource.similarity > lowestScoredSimilarity)
		.sort((first, second) => second.similarity - first.similarity)
}

// run the Scan, time it, and report what the ranking and the limit actually did
async function check(topicId: string, ownerId: string): Promise<boolean> {
	// time the whole pipeline, ingestion through review, driving the workflow's own stages in order
	const [openScan] = await db.insert(scans).values({ topicId, ownerId }).returning()
	if (!openScan) {
		throw new Error("could not open a scan for the smoke topic")
	}
	// the clock spans every stage, and the limit being checked is on the whole pipeline
	const startedAt = Date.now()
	const ingestResult = await ingestForScan(openScan.id, topicId)
	const reviewResult = await reviewForScan(openScan.id, topicId, ownerId, ingestResult, ingestResult.budget)
	await finishScan(openScan.id, topicId, ownerId, "creation", ingestResult, reviewResult)
	const elapsedMs = Date.now() - startedAt

	// re-read the row, whose counts and cost the closing stage wrote
	const topicScan = await loadScan(openScan.id)
	if (!topicScan) {
		throw new Error("the scan row vanished mid-smoke")
	}

	// the paid section's real size, against the limit that was supposed to bound it
	const scoredCount = topicScan.reused + topicScan.revalidated + topicScan.fetched
	const overshootCount = scoredCount - MAX_SCORED_RESOURCES_PER_SCAN
	const allowedOvershoot = REVIEW_CONCURRENCY - 1

	// the ranking check. an admitted resource that outranks the worst purchase should have been bought
	const { rankedResources, findingCount } = await loadResourceRanking(
		topicId,
		reviewResult.review.admittedResourceIds,
		reviewResult.review.scoredResourceIds,
		ingestResult.resources.map((resource) => resource.url),
	)
	const scoredSimilarities = rankedResources
		.filter((resource) => resource.isScored)
		.map((resource) => resource.similarity)
	const unscoredSimilarities = rankedResources
		.filter((resource) => !resource.isScored)
		.map((resource) => resource.similarity)

	// the two ends that have to be compared
	const lowestScoredSimilarity = Math.min(...scoredSimilarities)
	const highestUnscoredSimilarity =
		unscoredSimilarities.length > 0 ? Math.max(...unscoredSimilarities) : Number.NEGATIVE_INFINITY
	const rankingViolations = toRankingViolations(rankedResources)

	// print the run's report
	console.log("\n=== rank + concurrency smoke report ===")
	console.log(`REVIEW_CONCURRENCY : ${REVIEW_CONCURRENCY}`)
	console.log(`limit            : ${MAX_SCORED_RESOURCES_PER_SCAN}`)
	console.log(`time taken         : ${(elapsedMs / 1000).toFixed(1)}s`)
	console.log(`scan.status        : ${topicScan.status}`)

	// what the Scan did with its rankedResources, and what the paid section cost to do it
	console.log(`found/kept/filtered: ${topicScan.foundCount} / ${topicScan.keptCount} / ${topicScan.filteredCount}`)
	console.log(
		`fetch counts       : reused ${topicScan.reused}, revalidated ${topicScan.revalidated}, fetched ${topicScan.fetched}`,
	)
	console.log(`paid section size  : ${scoredCount} (overshoot ${overshootCount}, allowed ${allowedOvershoot})`)
	console.log(`cost               : $${Number(topicScan.cost).toFixed(4)}`)
	// the ranking evidence: the worst thing bought against the best thing skipped
	console.log(
		`rankedResources         : ${rankedResources.length} (scored ${scoredSimilarities.length}, unscored ${unscoredSimilarities.length})`,
	)
	console.log(`lowest scored      : ${lowestScoredSimilarity.toFixed(4)}`)
	console.log(
		`highest unscored   : ${highestUnscoredSimilarity === Number.NEGATIVE_INFINITY ? "n/a" : highestUnscoredSimilarity.toFixed(4)}`,
	)

	// the findings the topic actually holds, against the count the Scan recorded, so a drift between them shows
	console.log(`findings rows      : ${findingCount} (scan kept_count ${topicScan.keptCount})`)
	console.log(`ranking violations : ${rankingViolations.length}`)
	for (const violation of rankingViolations) {
		console.log(`  admitted ${violation.id} at ${violation.similarity.toFixed(4)} went unbought`)
	}
	console.log(`summary length     : ${(topicScan.scanSummary ?? "").trim().length}`)

	// the assertions this smoke test makes
	const results: [string, boolean][] = [
		["scan succeeded", topicScan.status === "succeeded"],
		["overshoot is within concurrency - 1", overshootCount <= allowedOvershoot],
		["findings were written", topicScan.keptCount > 0],
		["the scan bought its best survivors", rankingViolations.length === 0],
		["the scan report was written", (topicScan.scanSummary ?? "").trim().length > 0],
	]

	// print each check and return the overall result
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// reset the feed, seed it, run the checks, then always delete the fake owner
async function smokeTest(): Promise<number> {
	// every run starts cold, so two runs differ only by their concurrency setting
	const resetCount = await resetFeedResources()
	console.log(`reset ${resetCount} cached resources from the feed`)

	const { topicId, userId } = await seedTestData()
	// run the checks, then delete the owner regardless of outcome
	try {
		const isPassed = await check(topicId, userId)
		console.log(`\n=== smoke ${isPassed ? "PASSED" : "FAILED"} ===`)
		return isPassed ? 0 : 1
	} finally {
		await db.delete(users).where(eq(users.id, userId))
	}
}

// run the smoke test, computing the exit code instead of exiting early so telemetry can flush first
startTelemetry()
let exitCode: number
try {
	exitCode = await smokeTest()
} catch (error) {
	console.error(error)
	exitCode = 1
}

// flush telemetry, then report the outcome as the exit code
await shutdownTelemetry()
process.exitCode = exitCode
