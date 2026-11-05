// Topic-local queue decisions never modify another Topic's discovery or bypass review gates
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as queue from "@carlnotes/db/personalSourcesLinkQueue"
import { newBudget } from "@carlnotes/models/budget"
import type { DiscoveredResource } from "../ingest/ingester"
import { gateResources, type Resource, rankBySimilarity } from "../review/filter"
import type { TopicContext } from "../review/topicContext"
import { emptyReviewOutcome, type ReviewOutcome } from "../review/track"
import { loadPersonalSourcesReviewLinks } from "./linkQueue"

afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test("deleted claims lose their private-only discoveries and sender priority", async () => {
	const discover = (url: string, isFromPersonalSources: boolean): DiscoveredResource => ({
		url,
		kind: "read",
		sourceId: "source",
		isFromCustomSource: true,
		isFromPersonalSources,
	})
	const resources = [
		discover("https://example.org/deleted", true),
		discover("https://example.org/live", true),
		discover("https://example.org/public", false),
	]
	spyOn(queue, "loadClaimedPersonalSourcesLinks").mockResolvedValue([
		{ id: "entry", url: "https://example.org/live", personalSourceScoreBonus: 0.1 },
	])
	const review = await loadPersonalSourcesReviewLinks({
		topicId: "topic",
		scanId: "scan",
		discoveredResources: resources,
	})
	expect(review.discoveredResources.map(({ url }) => url)).toEqual([
		"https://example.org/live",
		"https://example.org/public",
	])
	expect([...review.personalSourceScoreBonuses.keys()]).toEqual(["https://example.org/live"])
	spyOn(queue, "loadClaimedPersonalSourcesLinks").mockResolvedValue([])
	expect(
		(await loadPersonalSourcesReviewLinks({ topicId: "other", scanId: "other-scan", discoveredResources: resources }))
			.personalSourceScoreBonuses.size,
	).toBe(0)
})

test("queued personal links lead existing Findings and stronger embedding matches", () => {
	// deliberately place the strongest ordinary candidate before both personal bonuses
	const relevant = [
		{ resource: { id: "ordinary", personalSourceScoreBonus: 0 } as Resource, embedding: [1, 0], similarity: 0.99 },
		{ resource: { id: "newsletter", personalSourceScoreBonus: 0.05 } as Resource, embedding: null, similarity: 0 },
		{ resource: { id: "personal", personalSourceScoreBonus: 0.1 } as Resource, embedding: null, similarity: 0 },
	]
	expect(rankBySimilarity(relevant, new Set(["ordinary"])).map(({ resource }) => resource.id)).toEqual([
		"personal",
		"newsletter",
		"ordinary",
	])
})

test("duplicate personal links keep the full contribution in either arrival order", async () => {
	// both senders contribute the same URL, one deliberately and one through list mail
	const links = [
		{ id: "newsletter", url: "https://example.org/shared", personalSourceScoreBonus: 0.05 as const },
		{ id: "personal", url: "https://example.org/shared", personalSourceScoreBonus: 0.1 as const },
	]
	for (const candidates of [links, [...links].reverse()]) {
		spyOn(queue, "loadClaimedPersonalSourcesLinks").mockResolvedValue(candidates)
		const review = await loadPersonalSourcesReviewLinks({ topicId: "topic", scanId: "scan", discoveredResources: [] })
		expect(review.personalSourceScoreBonuses.get("https://example.org/shared")).toBe(0.1)
	}
})

test("durable filtered outcomes settle links while budget-deferred or stopped candidates stay queued", async () => {
	// one low-relevance candidate has a vector and one deferred candidate needs a paid embedding
	stubConnectionPool()
	const considered = mock<NonNullable<ReviewOutcome["onResourceConsidered"]>>(() => Promise.resolve())
	const outcome = { ...emptyReviewOutcome(), onResourceConsidered: considered }
	const resources = [
		{ id: "filtered", url: "https://example.org/filtered", kind: "read", embedding: [0, 1] },
		{ id: "deferred", url: "https://example.org/deferred", kind: "read", embedding: null },
	] as Resource[]
	const context = { embedding: [1, 0] } as TopicContext
	const budget = { ...newBudget(), limitDollars: 0 }
	expect(await gateResources(resources, context, outcome, budget)).toHaveLength(0)
	expect(considered).toHaveBeenCalledTimes(1)
	expect(considered.mock.calls[0]).toEqual([
		"https://example.org/filtered",
		{ reviewOutcome: "rejected", reviewReason: "below relevance threshold" },
	])
	expect(outcome.deferredCount).toBe(1)
	considered.mockClear()
	await gateResources(resources, context, outcome, budget, undefined, AbortSignal.abort())
	expect(considered).not.toHaveBeenCalled()
})
