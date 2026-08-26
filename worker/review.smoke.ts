// a live smoke test for one real Scan on a busy feed, reporting time taken, limit overshoot, and whether it kept its
// best survivors. run it with: bun run smoke:review. each run resets its feed, so two REVIEW_CONCURRENCY values compare fairly
import { cosineSimilarity } from "ai"
import { and, eq, inArray, isNotNull, like } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, scans, sources, topics, users } from "../db/schema"
import { embedVector } from "./models"
import { isRelevant } from "./review/filter"
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

// review's own near-duplicate threshold, mirrored so a dedupe drop can be told apart from a ranking miss
const NEAR_DUPLICATE_DISTANCE = 0.05

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

// append a stamp for the database to persist a unique identifier for fixture data
const smokeTestStamp = Date.now()

// seed a fake owner, a topic whose context matches the feed, and the RSS source
async function seedTestData(): Promise<{ topicId: string; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic, source, scan, and findings
	const [user] = await db
		.insert(users)
		.values({
			name: "review-smoke",
			email: `review-smoke+${smokeTestStamp}@example.test`,
			username: `review-smoke-${smokeTestStamp}`,
			usernameNormalized: `reviewsmoke${smokeTestStamp}`,
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

// one resource as the ranking saw it, with the vector kept so dedupe drops can be explained
type RankedResource = {
	id: string
	embedding: number[]
	similarity: number
	isScored: boolean
	kind: (typeof resources.$inferSelect)["kind"]
	title: string | null
}

// every Resource this Scan considered, with its similarity to the topic context recomputed
async function loadResourceRanking(
	topicId: string,
	scoredResourceIds: string[],
	discoveredUrls: string[],
): Promise<{ rankedResources: RankedResource[]; findingCount: number }> {
	// the topic-context embedding, wrapped as the query side exactly as the gate wraps it
	const contextEmbedding = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${TOPIC_CONTEXT}`)

	// the resources the review actually scored, reported by the review itself
	const scoredIds = new Set(scoredResourceIds)
	const findingRows = await db
		.select({ resourceId: findings.resourceId })
		.from(findings)
		.where(eq(findings.topicId, topicId))

	// only the Resources this Scan actually ingested
	const resourceRows = await db
		.select({ id: resources.id, embedding: resources.embedding, kind: resources.kind, title: resources.title })
		.from(resources)
		.where(and(inArray(resources.url, discoveredUrls), isNotNull(resources.embedding)))

	// score each resource the way the ranking did, tagging the ones that won a paid ranking slot
	const rankedResources = resourceRows.map((resourceRow) => ({
		id: resourceRow.id,
		embedding: resourceRow.embedding as number[],
		similarity: cosineSimilarity(resourceRow.embedding as number[], contextEmbedding),
		isScored: scoredIds.has(resourceRow.id),
		kind: resourceRow.kind,
		title: resourceRow.title,
	}))

	// the finding count comes back too, printed next to the Scan's own kept count so a mismatch is visible
	return { rankedResources, findingCount: findingRows.length }
}

// the unscored rankedResources that outrank the worst scored resource and that dedupe does not explain
function toRankingViolations(rankedResources: RankedResource[]): RankedResource[] {
	// walk the ranking the way the admission pass does, best-first
	const bySimilarity = [...rankedResources].sort((first, second) => second.similarity - first.similarity)
	const scoredSimilarities = bySimilarity.filter((resource) => resource.isScored).map((resource) => resource.similarity)
	const lowestScoredSimilarity = Math.min(...scoredSimilarities)

	// an unscored resource above the worst purchase is only legitimate when the filter had a reason to drop it
	return bySimilarity.filter((rankedResource, index) => {
		if (rankedResource.isScored || rankedResource.similarity <= lowestScoredSimilarity) {
			return false
		}

		// the relevance gate reads a different threshold per kind
		if (!isRelevant(rankedResource.similarity, rankedResource.kind)) {
			return false
		}

		// dedupe explains the drop when something ranked above it is a near-duplicate of it, or is the same article at another url
		const higherRanked = bySimilarity.slice(0, index)
		const isDeduped = higherRanked.some(
			(higherRankedResource) =>
				1 - cosineSimilarity(rankedResource.embedding, higherRankedResource.embedding) < NEAR_DUPLICATE_DISTANCE ||
				(rankedResource.title !== null && higherRankedResource.title === rankedResource.title),
		)
		return !isDeduped
	})
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

	// the ranking check. anything skipped that outranks the worst purchase must be explained by dedupe
	const { rankedResources, findingCount } = await loadResourceRanking(
		topicId,
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
		console.log(`  skipped ${violation.id} at ${violation.similarity.toFixed(4)}, no near-duplicate above it`)
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

// flush telemetry before exit, then exit because the Neon pool would otherwise keep the process alive
await shutdownTelemetry()
process.exit(exitCode)
