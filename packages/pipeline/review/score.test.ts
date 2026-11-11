// score tests: score policy, model requests, a rate-limited scoring call, bounded concurrency, and paid review
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { PERSONAL_SOURCE_SCORE_BONUS } from "@carlnotes/contracts/sourceScoring"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import type { scans } from "@carlnotes/db/schema/scans"
import { canScoreResource, charge, newBudget, releaseScanSpend } from "@carlnotes/models/budget"
import { toChatCompletionResponse } from "@carlnotes/models/chatCompletionTestFixtures"
import { SCORE_OUTPUT_TOKENS } from "@carlnotes/models/models"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { rankBySimilarity } from "./filter"
import { findingIdsToFilter } from "./index"
import {
	buildScorePrompt,
	fetchAndScoreResources,
	MAX_SCORED_RESOURCE_DOLLARS,
	reserveScoredResource,
	scoreResource,
} from "./score"
import { isPromoted } from "./scorePolicy"
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

// the proxy settings a scoring call needs, the real fetch, and the scoring replies a stubbed proxy returns in order
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])
const originalFetch = globalThis.fetch
const scoringReplies: ScoringReply[] = []
const scoringRequests: Record<string, unknown>[] = []
let scoringCallCount = 0

// a scoring reply: the structured output a call returns, or a failed proxy response with its status and body
type ScoringReply = object | ProxyFailure
type ProxyFailure = { proxyStatus: number; proxyBody: string }

// stub the proxy so each scoring call gets the next reply as its structured output or its failed response
function stubScoringReplies(replies: ScoringReply[]): void {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	scoringReplies.splice(0, scoringReplies.length, ...replies)
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		scoringRequests.push(JSON.parse(String(init?.body)))
		// one completion whose content is the next reply, repeating the last one past the end
		const scoringReply = scoringReplies[Math.min(scoringCallCount, scoringReplies.length - 1)]
		scoringCallCount++
		if (scoringReply && "proxyStatus" in scoringReply) {
			return new Response(scoringReply.proxyBody, { status: scoringReply.proxyStatus })
		}
		return toChatCompletionResponse(JSON.stringify(scoringReply))
	}) as unknown as typeof fetch
}

// put back the spies, the proxy settings, fetch, the call count, and the connection pool
afterEach(() => {
	mock.restore()
	restoreEnvSettings()
	globalThis.fetch = originalFetch
	scoringCallCount = 0
	scoringRequests.length = 0
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

test("a Resource reserves every sender's scoring cost before another Resource starts", async () => {
	// two senders require more than the ordinary single-Resource allowance
	const budget = { ...newBudget(), limitDollars: MAX_SCORED_RESOURCE_DOLLARS * 1.5 }
	const personalSources = ["alice", "bob"].map((userId) => ({
		userId,
		topicId: "topic-1",
		revision: 1,
		text: "Private context",
		expiresAt: null,
		includedEntryCount: 1,
		hasIncompleteCoverage: false,
	}))
	const emptyResources = ["one", "two"].map((id) => ({ ...tweetResource, id, snippet: "" }))
	const reviewedIds = await fetchAndScoreResources(
		emptyResources,
		scoringScan,
		"topic-1",
		{ ...topicContext, personalSources },
		emptyReviewOutcome(),
		budget,
		new Set(),
		"fixture-key",
	)
	expect(reviewedIds).toEqual(["one"])
	expect(budget.fetchCounts.reusedCount).toBe(1)
	expect(budget.reservedDollars).toBe(0)
	expect(scoringCallCount).toBe(0)
})

// scores the tweet through the whole paid path and returns what the review counted and the queries sent
async function scoreTweet(
	personalSourceScoreBonus: 0 | 0.05 | 0.1 = 0,
): Promise<{ filteredCount: number; keptCount: number; queryTexts: string[] }> {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('insert into "findings"') ? [["finding-1", true, 0.5]] : [],
	)
	const reviewOutcome = emptyReviewOutcome()
	await fetchAndScoreResources(
		[{ ...tweetResource, personalSourceScoreBonus }],
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
test("an unsafe personal Resource is marked and writes no Finding despite its bonus", async () => {
	stubScoringReplies([{ score: 0.9, isUnsafe: true }])
	const { filteredCount, keptCount, queryTexts } = await scoreTweet(0.1)
	expect(filteredCount).toBe(1)
	expect(keptCount).toBe(0)
	expect(queryTexts.some((queryText) => queryText.startsWith('update "resources" set "is_unsafe"'))).toBe(true)
	expect(queryTexts.some((queryText) => queryText.includes('"findings"'))).toBe(false)
})

// a safe score clears the mark an earlier score left, and the Resource becomes a Finding
test("a safe score clears the unsafe mark and keeps the Finding", async () => {
	stubScoringReplies([{ score: 0.3, isUnsafe: false }])
	const { filteredCount, keptCount, queryTexts } = await scoreTweet(0.1)
	expect(filteredCount).toBe(0)
	expect(keptCount).toBe(1)
	expect(queryTexts.some((queryText) => queryText.startsWith('update "resources" set "is_unsafe"'))).toBe(true)
})

// enforce the same output bound that the paid section reserves
test("ordinary scoring bounds both model calls and charges invalid premium output", async () => {
	stubScoringReplies([{ score: 0.9, isUnsafe: false }, {}])
	const budget = newBudget()
	await expect(scoreResource("page", "topic", budget)).rejects.toThrow()

	// both calls ask for the same output limit, and the premium one is charged
	expect(scoringRequests).toHaveLength(2)
	for (const request of scoringRequests) {
		expect(request.max_tokens ?? request.max_completion_tokens).toBe(SCORE_OUTPUT_TOKENS)
	}
	expect(scoringRequests[1]?.reasoning_effort).toBe("low")
	expect(budget.stageCosts.scoringPremium).toBeGreaterThan(0)
})

// large example titles cannot exceed the reserved prompt input
test("scoring bounds long Topic examples while retaining the full attachment context", async () => {
	const content = "x".repeat(8000)
	const context = `${"a".repeat(24_000)}attachment-end${"example title ".repeat(4000)}outside-boundary`
	const result = await buildScorePrompt(content, context, true)
	expect(result.prompt).toContain("attachment-end")
	expect(result.prompt).not.toContain("outside-boundary")
	expect(result.prompt.length).toBeLessThanOrEqual(48_000)
})

// bonus-bearing candidates still call the scoring models and record their page-grounded explanation
test("personal priority spends the final scoring slot before ordinary links and leaves deferred work unsettled", async () => {
	// reserve enough for one concurrent Resource while keeping the ordinary candidate first in discovery order
	stubScoringReplies([{ score: 0.9 }, { score: 0.7, relevanceExplanation: "The page compares evaluation methods." }])
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('insert into "findings"') ? [["personal-finding", false, 0.8]] : [],
	)
	const considered: string[] = []
	const outcome = {
		...emptyReviewOutcome(),
		onResourceConsidered: async (url: string) => {
			considered.push(url)
		},
	}
	const ordinary = { ...tweetResource, id: "ordinary", url: "https://x.com/someone/status/2" }
	const personal = { ...tweetResource, id: "personal", personalSourceScoreBonus: 0.1 as const }
	const ranked = rankBySimilarity([
		{ resource: ordinary, embedding: [1], similarity: 1 },
		{ resource: personal, embedding: null, similarity: 0 },
	])
	const budget = { ...newBudget(), maxScoredResources: 1, limitDollars: MAX_SCORED_RESOURCE_DOLLARS / 2 }
	const reviewed = await fetchAndScoreResources(
		ranked.map(({ resource }) => resource),
		scoringScan,
		"topic-1",
		topicContext,
		outcome,
		budget,
		new Set(),
	)

	// only the queued personal candidate is scored and settled, with a real explanation and persisted score bonus
	expect(reviewed).toEqual(["personal"])
	expect(considered).toEqual([personal.url])
	expect(outcome.deferredCount).toBe(1)
	expect(scoringCallCount).toBe(2)
	expect(outcome.keptFindings[0]?.relevanceExplanation).toBe("The page compares evaluation methods.")
	expect(sentQueries.find(({ text }) => text.startsWith('insert into "findings"'))?.text).toContain(
		'"personal_source_score_bonus"',
	)
})

test("a personal-source bonus cannot save a weak link from the normal max-results trim", () => {
	// neither personal nor custom provenance grants the bookmark or rating exemption
	const rows = [
		{ id: "ordinary", relevanceScore: 0.8, createdAt: new Date(0), isExempt: false },
		{
			id: "personal",
			relevanceScore: 0.2 + PERSONAL_SOURCE_SCORE_BONUS,
			createdAt: new Date(1),
			isExempt: false,
		},
	]
	expect(findingIdsToFilter(rows, 1)).toEqual(["personal"])
})

// a scoring rate limit and a rejection, as LiteLLM returns them
const RATE_LIMIT: ProxyFailure = { proxyStatus: 429, proxyBody: '{"error":{"message":"rate limited"}}' }
const REJECTION: ProxyFailure = { proxyStatus: 400, proxyBody: '{"error":{"message":"bad request"}}' }

// scores the tweet through the whole paid path on a budget, with instant waits, and returns what the review counted
async function scoreTweetWithWaits(
	budget = newBudget(),
): Promise<{ keptCount: number; failedCount: number; findingWriteCount: number; sleepCount: number }> {
	// the waits resolve at once, and Finding writes are counted
	const sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined)
	spyOn(console, "warn").mockImplementation(() => {})
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('insert into "findings"') ? [["finding-1", true, 0.5]] : [],
	)

	// run the paid path and count what it did
	const reviewOutcome = emptyReviewOutcome()
	await fetchAndScoreResources([tweetResource], scoringScan, "topic-1", topicContext, reviewOutcome, budget, new Set())
	return {
		keptCount: reviewOutcome.keptFindings.length,
		failedCount: reviewOutcome.failedCount,
		findingWriteCount: sentQueries.filter((sentQuery) => sentQuery.text.startsWith('insert into "findings"')).length,
		sleepCount: sleepSpy.mock.calls.length,
	}
}

test("a scoring rate limit followed by a success keeps the Finding and charges one call", async () => {
	// a clean score's charge to compare against
	stubScoringReplies([{ score: 0.3 }])
	const cleanBudget = newBudget()
	await scoreTweetWithWaits(cleanBudget)

	// a 429, then the same score
	scoringCallCount = 0
	stubScoringReplies([RATE_LIMIT, { score: 0.3 }])
	const reportErrorSpy = quietErrorReports()
	const budget = newBudget()
	const scoreTweetResult = await scoreTweetWithWaits(budget)

	// two calls, one sleep, one Finding, the clean charge, and no error report
	expect(scoringCallCount).toBe(2)
	expect(scoreTweetResult).toMatchObject({ keptCount: 1, failedCount: 0, findingWriteCount: 1, sleepCount: 1 })
	expect(budget.stageCosts.scoringCheap).toBe(cleanBudget.stageCosts.scoringCheap)
	expect(reportErrorSpy).not.toHaveBeenCalled()
})

test("a scoring rate limit that outlasts the waits fails the Resource once and releases its reservation", async () => {
	// every attempt is rate limited
	stubScoringReplies([RATE_LIMIT])
	const reportErrorSpy = quietErrorReports()
	const budget = newBudget()
	const scoreTweetResult = await scoreTweetWithWaits(budget)

	// five attempts, four waits, one report, no Finding, and nothing left reserved or charged
	expect(scoringCallCount).toBe(5)
	expect(scoreTweetResult).toMatchObject({ keptCount: 0, failedCount: 1, findingWriteCount: 0, sleepCount: 4 })
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(budget.reservedDollars).toBe(0)
	expect(budget.stageCosts.scoringCheap).toBe(0)
})

test("a rejected scoring request fails the Resource after one attempt", async () => {
	stubScoringReplies([REJECTION])
	const reportErrorSpy = quietErrorReports()
	const scoreTweetResult = await scoreTweetWithWaits()
	expect(scoringCallCount).toBe(1)
	expect(scoreTweetResult).toMatchObject({ keptCount: 0, failedCount: 1, sleepCount: 0 })
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})
