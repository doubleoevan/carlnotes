// score tests for the promotion threshold, bounded concurrency, the plan limit check, the score prompt, the review
// fields a re-score writes, and the found scan that a re-score keeps
import { expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import type { resources, scans } from "@carlnotes/db/schema/scans"
import { canScoreResource, newBudget } from "@carlnotes/models/budget"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { buildScorePrompt, isPromoted, toFindingReviewFields, upsertFinding } from "./score"

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
