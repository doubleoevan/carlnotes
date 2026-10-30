// score tests for the promotion threshold, bounded concurrency, the plan limit check, the score prompt, the review
// fields a re-score writes, the found scan that a re-score keeps, and the safety judgment that drops unsafe content
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import type { resources, scans } from "@carlnotes/db/schema/scans"
import { canScoreResource, charge, newBudget, releaseScanSpend } from "@carlnotes/models/budget"
import { toChatCompletionResponse } from "@carlnotes/models/chatCompletionTestFixtures"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	buildScorePrompt,
	fetchAndScoreResources,
	isPromoted,
	MAX_SCORED_RESOURCE_DOLLARS,
	reserveScoredResource,
	scoreResource,
	toFindingReviewFields,
	upsertFinding,
} from "./score"
import { emptyReviewOutcome } from "./track"

// a high cheap-model score earns promotion to the premium score-model's re-score
test("isPromoted gates on the promotion threshold", () => {
	expect(isPromoted(0.9)).toBe(true)
	expect(isPromoted(0.2)).toBe(false)
})

// the paid section runs concurrently but bounded. an unbounded burst draws Firecrawl 429s
test("runWithConcurrency never exceeds its limit and returns results in order", async () => {
	// track how many tasks run at once, recording the high-water mark
	let runningCount = 0
	let peakRunningCount = 0
	const results = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
		// enter the slot, yield so other workers interleave, then leave it
		runningCount++
		peakRunningCount = Math.max(peakRunningCount, runningCount)
		await Promise.resolve()
		runningCount--
		return item * 2
	})

	// every item ran, in input order, and no more than the limit was ever running
	expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
	expect(peakRunningCount).toBeLessThanOrEqual(3)
})

// the plan limit is checked before each dispatch, so once it trips the rest are deferred instead of bought
test("the plan limit check halts dispatch once either limit is reached", async () => {
	// a budget that admits two resources before its scored-resource limit trips
	const budget = { ...newBudget(), limitDollars: 0.5, maxScoredResources: 2 }

	// dispatch five resources the way the ranked pass does, checking the limit before paying for each
	const outcomes = await runWithConcurrency([1, 2, 3, 4, 5], 1, async (item) => {
		if (!canScoreResource(budget)) {
			return "deferred"
		}
		budget.fetchCounts.fetchedCount++
		return `kept ${item}`
	})

	// the first two were bought, and the rest deferred, without failing anything
	expect(outcomes).toEqual(["kept 1", "kept 2", "deferred", "deferred", "deferred"])
})

// each Resource reserves its largest cost before its paid section, and starts only while the spent and reserved
// dollars are below the Scan's limit, so the Resources running at once pass the limit by at most one largest cost.
// checking spent dollars alone would let all four start under the limit and finish past it
test("four parallel Resources against a nearly spent Scan budget start only while budget is left", async () => {
	// the Scan has two and a half Resources' largest costs left
	const budget = newBudget()
	charge(budget, "ingestion", budget.limitDollars - 2.5 * MAX_SCORED_RESOURCE_DOLLARS)

	// four Resources run at once, each reserving, paying for its fetch and scores while the others run, then releasing
	const outcomes = await runWithConcurrency([1, 2, 3, 4], 4, async (item) => {
		if (!reserveScoredResource(budget)) {
			return "deferred"
		}

		// pay the whole largest cost after the others have started, and release the reservation at the end
		try {
			await Bun.sleep(1)
			charge(budget, "scoringCheap", MAX_SCORED_RESOURCE_DOLLARS)
			return `scored ${item}`
		} finally {
			releaseScanSpend(budget, MAX_SCORED_RESOURCE_DOLLARS)
		}
	})

	// three started while budget was left and the fourth was deferred, the Scan passed its limit by less than one
	// Resource's largest cost, and no reservation is left open
	expect(outcomes).toEqual(["scored 1", "scored 2", "scored 3", "deferred"])
	expect(budget.spentDollars - budget.limitDollars).toBeLessThan(MAX_SCORED_RESOURCE_DOLLARS)
	expect(budget.reservedDollars).toBe(0)
})

// buildScorePrompt writes the prompt from summarize-resource.md. only the premium tier asks for the relevance explanation
test("buildScorePrompt includes content and context and gates the relevance explanation", async () => {
	// the cheap model only asks for a score
	const cheapModelResult = await buildScorePrompt("article body", "topic context", false)
	expect(cheapModelResult.prompt).toContain("article body")
	expect(cheapModelResult.prompt).toContain("topic context")
	expect(cheapModelResult.prompt).not.toContain("relevanceExplanation")

	// the premium model also asks for the relevance explanation, with no markers or placeholders leaking through
	const premiumModelResult = await buildScorePrompt("body", "ctx", true)
	expect(premiumModelResult.prompt).toContain("relevanceExplanation")
	expect(premiumModelResult.prompt).not.toContain("premium-tier")
	expect(premiumModelResult.prompt).not.toContain("{{")

	// without Langfuse keys, no registry prompt is attached
	expect(cheapModelResult.registryPrompt).toBeUndefined()
})

// a re-score rewrites the review and nothing else, so a user's rating and view count survive it.
// without this an edited prompt would quietly clear a rating someone left
test("a review names only the columns a re-score decides", () => {
	const review = toFindingReviewFields({
		scanId: "scan-1",
		score: 0.82,
		relevanceExplanation: "why this matters",
		topicContextHash: "abc123",
		contentHash: "def456",
	})

	// the review's own columns, and no column a user writes
	expect(Object.keys(review).sort()).toEqual([
		"relevanceExplanation",
		"relevanceScore",
		"reviewedContentHash",
		"reviewedContextHash",
		"scanId",
	])
	for (const userColumn of ["rating", "ratedByUserId", "ratedTeamId", "ratedRole", "viewCount"]) {
		expect({ userColumn, isWritten: userColumn in review }).toEqual({ userColumn, isWritten: false })
	}
})

// the scan that first found a finding is written with the insert alone. a re-score moves scan_id to the re-scoring scan
// and leaves found_scan_id, so a re-scored finding is not new to the digest or the podcast episode's plan again
test("upsertFinding writes the found scan on the insert and never on the re-score", async () => {
	// a pool whose upsert returns an updated row
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('insert into "findings"') ? [["finding-1", false, 0.5]] : [],
	)
	try {
		// the re-scoring scan, the resource it scored, and the review it wrote
		const scan = { id: "scan-2" } as typeof scans.$inferSelect
		const resource = { id: "resource-1", contentHash: "content-hash" } as typeof resources.$inferSelect
		const review = { score: 0.5, relevanceExplanation: "why it matters", topicContextHash: "context-hash" }

		// re-score a finding an earlier scan found, which the pool reports as an updated row
		const upsertFindingResult = await upsertFinding({
			scan,
			topicId: "topic-1",
			resource,
			...review,
			isFromCustomSource: false,
		})
		expect(upsertFindingResult).toEqual({ isNew: false, relevanceScore: 0.5 })

		// the insert names the found scan, and the conflict update names the latest scan alone
		const upsertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "findings"'))
		const [insertClause = "", updateClause = ""] = (upsertQuery?.text ?? "").split("on conflict")
		expect(insertClause).toContain('"found_scan_id"')
		expect(updateClause).toContain('"scan_id"')
		expect(updateClause).not.toContain('"found_scan_id"')
	} finally {
		// put the connection pool's own query back
		restoreConnectionPool()
	}
})

// a resource with no stored content hash is reviewed against no content hash instead of an empty string
test("a review keeps a null content hash null", () => {
	const review = toFindingReviewFields({
		scanId: "scan-1",
		score: 0.1,
		relevanceExplanation: "",
		topicContextHash: "abc123",
		contentHash: null,
	})
	expect(review.reviewedContentHash).toBe(null)
})

// the proxy settings a scoring call needs, the real fetch, and the scoring replies a stubbed proxy returns in order
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])
const originalFetch = globalThis.fetch
const scoringReplies: object[] = []
let scoringCallCount = 0

// stub the proxy so each scoring call gets the next reply as its structured output
function stubScoringReplies(replies: object[]): void {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	scoringReplies.splice(0, scoringReplies.length, ...replies)
	globalThis.fetch = (async () => {
		// one completion whose content is the next reply, repeating the last one past the end
		const content = JSON.stringify(scoringReplies[Math.min(scoringCallCount, scoringReplies.length - 1)])
		scoringCallCount++
		return toChatCompletionResponse(content)
	}) as unknown as typeof fetch
}

// put back the proxy settings, fetch, the call count, and the connection pool
afterEach(() => {
	restoreEnvSettings()
	globalThis.fetch = originalFetch
	scoringCallCount = 0
	restoreConnectionPool()
})

// a cheap-tier unsafe judgment ends the scoring before the premium tier, however high the score
test("a cheap-tier unsafe judgment skips the premium tier", async () => {
	stubScoringReplies([{ score: 0.9, isUnsafe: true }])
	const scoredResource = await scoreResource("explicit page", "topic", newBudget())
	expect(scoredResource.isUnsafe).toBe(true)
	expect(scoringCallCount).toBe(1)
})

// the premium tier's unsafe judgment is the one returned after a safe cheap score promotes the Resource
test("a premium-tier unsafe judgment is returned", async () => {
	stubScoringReplies([
		{ score: 0.9, isUnsafe: false },
		{ score: 0.9, relevanceExplanation: "x", isUnsafe: true },
	])
	const scoredResource = await scoreResource("page", "topic", newBudget())
	expect(scoredResource.isUnsafe).toBe(true)
	expect(scoringCallCount).toBe(2)
})

// a model that leaves the safety judgment out is read as judging the content safe
test("a missing safety judgment reads as safe", async () => {
	stubScoringReplies([{ score: 0.2 }])
	expect(await scoreResource("page", "topic", newBudget())).toEqual({
		score: 0.2,
		relevanceExplanation: "",
		isUnsafe: false,
	})
})

// the tweet, the Scan, and the topic context the scoring path tests share. a tweet's snippet is its whole text, so the
// path makes no paid fetch
const tweetResource = {
	id: "resource-1",
	url: "https://x.com/someone/status/1",
	title: "@someone on X",
	snippet: "the tweet's text",
	contentHash: "content-hash",
} as unknown as Parameters<typeof fetchAndScoreResources>[0][number]
const scoringScan = { id: "scan-1" } as typeof scans.$inferSelect
const topicContext = { name: "t", text: "t", embedding: [], contextHash: "context-hash", scoreText: "topic" }

// scores the tweet through the whole paid path and returns what the review counted and the queries sent
async function scoreTweet(): Promise<{ filteredCount: number; keptCount: number; queryTexts: string[] }> {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('insert into "findings"') ? [["finding-1", true, 0.5]] : [],
	)
	const reviewOutcome = emptyReviewOutcome()
	await fetchAndScoreResources(
		[tweetResource],
		scoringScan,
		"topic-1",
		topicContext,
		reviewOutcome,
		newBudget(),
		new Set(),
	)
	return {
		filteredCount: reviewOutcome.filteredCounts["unsafe content"],
		keptCount: reviewOutcome.keptFindings.length,
		queryTexts: sentQueries.map((sentQuery) => sentQuery.text),
	}
}

// an unsafe Resource is marked, counted under its own drop reason, and gets no Finding, so a kept Finding and the
// notes on it are never touched
test("an unsafe Resource is marked and writes no Finding", async () => {
	stubScoringReplies([{ score: 0.9, isUnsafe: true }])
	const { filteredCount, keptCount, queryTexts } = await scoreTweet()
	expect(filteredCount).toBe(1)
	expect(keptCount).toBe(0)
	expect(queryTexts.some((queryText) => queryText.startsWith('update "resources" set "is_unsafe"'))).toBe(true)
	expect(queryTexts.some((queryText) => queryText.includes('"findings"'))).toBe(false)
})

// a safe score clears the mark an earlier score left, and the Resource becomes a Finding
test("a safe score clears the unsafe mark and keeps the Finding", async () => {
	stubScoringReplies([{ score: 0.3, isUnsafe: false }])
	const { filteredCount, keptCount, queryTexts } = await scoreTweet()
	expect(filteredCount).toBe(0)
	expect(keptCount).toBe(1)
	expect(queryTexts.some((queryText) => queryText.startsWith('update "resources" set "is_unsafe"'))).toBe(true)
})
