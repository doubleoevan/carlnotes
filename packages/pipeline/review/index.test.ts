// the review's order around the paid stage, with every stage stubbed: a page's filtered finding is deleted just before
// the page goes to the model, and the max-results filter runs after the scores are in
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import type { scans } from "@carlnotes/db/schema/scans"
import * as sharedComments from "@carlnotes/db/sharedComments"
import { newBudget } from "@carlnotes/models/budget"
import * as attach from "../attach"
import * as linkQueue from "../personalSources/linkQueue"
import * as topicMemoryPrompt from "../topicMemoryPrompt"
import * as dedupe from "./dedupe"
import * as filter from "./filter"
import * as filteredFindings from "./filteredFindings"
import { reviewScan } from "./index"
import * as maxTopicFindings from "./maxTopicFindings"
import { toTestResource } from "./reviewTestFixtures"
import * as score from "./score"
import * as scoreExamplePages from "./scoreExamplePages"
import * as summarize from "./summarize"
import * as topicContext from "./topicContext"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// stub every stage of a review that finds the given Resources worth scoring, and return the steps in the order they
// ran
function stubReviewStages(resourceIds: string[]): string[] {
	// a Topic with no personal link, no Finding yet, and a context to review against
	const steps: string[] = []
	const resourcesToReview = resourceIds.map((id) => ({ ...toTestResource(id), url: `https://example.com/${id}` }))
	stubConnectionPool(() => [])

	// the personal links pass the discovered Resources through
	spyOn(linkQueue, "loadPersonalSourcesReviewLinks").mockImplementation(async ({ discoveredResources }) => ({
		discoveredResources,
		personalSourceScoreBonuses: new Map(),
		claimedUrls: new Set(),
	}))
	spyOn(attach, "buildTopicScanContext").mockResolvedValue({ name: "Grinders", context: "Burr grinders." })

	// what the score prompt reads beside the context
	spyOn(scoreExamplePages, "loadScoreExamplePages").mockResolvedValue({
		likedOrBookmarkedPages: [],
		ratedDownPages: [],
	})
	spyOn(sharedComments, "loadSharedCommentTexts").mockResolvedValue([])
	spyOn(topicMemoryPrompt, "loadTopicMemoryPrompt").mockResolvedValue("")
	spyOn(topicContext, "loadTopicContext").mockResolvedValue({
		...{ name: "Grinders", text: "Grinders", embedding: [1, 0], contextHash: "context-1", scoreText: "Grinders" },
	})

	// the unpaid stages let every Resource through
	spyOn(filter, "loadResourcesToReview").mockResolvedValue(resourcesToReview)
	spyOn(filter, "loadUrlSourcePageUrls").mockResolvedValue([])
	spyOn(filter, "gateResources").mockResolvedValue(
		resourcesToReview.map((resource) => ({ resource, embedding: [1, 0], similarity: 0.9 })),
	)
	spyOn(dedupe, "dedupeResources").mockResolvedValue(resourcesToReview)

	// the three steps whose order the tests read
	spyOn(filteredFindings, "deleteFilteredFindings").mockImplementation(async (_topicId, deletedResourceIds) => {
		steps.push(`delete the filtered findings of ${deletedResourceIds.join(", ")}`)
	})
	spyOn(score, "fetchAndScoreResources").mockImplementation(async () => {
		steps.push("score")
		return resourceIds
	})

	// the filter removes nothing, and no recap is written
	spyOn(maxTopicFindings, "filterTopicFindings").mockImplementation(async () => {
		steps.push("filter")
		return { keptFindingUrls: new Set<string>(), filteredFindingCount: 0 }
	})
	spyOn(summarize, "toTopicScanSummary").mockResolvedValue("")
	return steps
}

// a page judged again that ends with no Finding must leave no filtered finding, so the row goes before the paid stage
test("a page's filtered finding is deleted just before the paid stage, and the filter closes the review", async () => {
	const steps = stubReviewStages(["held-page", "new-page"])
	const scan = { id: "scan-1" } as typeof scans.$inferSelect
	const discoveredResources = [{ url: "https://example.com/held-page" }, { url: "https://example.com/new-page" }]

	// both pages reach the paid stage
	const reviewSummary = await reviewScan(
		scan,
		"topic-1",
		discoveredResources as Parameters<typeof reviewScan>[2],
		[],
		newBudget(),
	)
	expect(steps).toEqual(["delete the filtered findings of held-page, new-page", "score", "filter"])
	expect(reviewSummary.scoredResourceIds).toEqual(["held-page", "new-page"])
})

// a Scan that rediscovers only pages it already judged scores nothing and writes no recap, and still filters
test("a review with nothing to score still runs the filter, and writes no recap", async () => {
	const steps = stubReviewStages([])
	const scan = { id: "scan-1" } as typeof scans.$inferSelect
	const reviewSummary = await reviewScan(scan, "topic-1", [], [], newBudget())
	expect(steps).toEqual(["filter"])
	expect(reviewSummary).toMatchObject({ keptCount: 0, scanSummary: "", scoredResourceIds: [] })
})
