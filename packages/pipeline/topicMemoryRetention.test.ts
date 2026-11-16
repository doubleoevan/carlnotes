import { expect, test } from "bun:test"
import { TOPIC_MEMORY_ACTIVE_LIMIT } from "@carlnotes/contracts/topicMemories"
import { toEvictedTopicMemoryIds, toTopicMemoryCleanupGroups, toTopicMemoryPairId } from "./topicMemoryRetention"

test("cleanup joins confirmed pairs and keeps corrected and saved takeaways", () => {
	// 0.9 requires explicit confirmation, and two different known people remain separate
	const oldest = {
		id: "oldest",
		text: "One takeaway",
		firstSeenAt: new Date("2026-01-01"),
		embedding: [1, 0],
		embeddingModel: "model",
		isActive: true,
		isSavedTakeaway: false,
		hasCorrection: false,
		personMatchKey: null,
		factDate: null,
		needsReview: false,
		reviewMatchId: null,
	}
	const saved = {
		...oldest,
		id: "saved",
		embedding: [0.9, 0.436],
		needsReview: true,
		reviewMatchId: "corrected",
		isSavedTakeaway: true,
	}
	const corrected = { ...oldest, id: "corrected", firstSeenAt: new Date("2026-03-01"), hasCorrection: true }
	const separate = { ...oldest, id: "namesake", personMatchKey: "different Wilson Chen" }
	const approved = new Set([toTopicMemoryPairId("corrected", "saved"), toTopicMemoryPairId("oldest", "saved")])
	expect(
		toTopicMemoryCleanupGroups([oldest, saved, corrected, separate], approved).map((group) =>
			group.map(({ id }) => id),
		),
	).toEqual([["corrected", "saved", "oldest"], ["namesake"]])
})

test("separate facts confirmed against the same takeaway stay separate", () => {
	// the oldest row overlaps both details, but the dates and runtime make different claims
	const summary = {
		id: "episode",
		text: "The episode aired in May and lasts 56 minutes.",
		firstSeenAt: new Date("2026-05-02"),
		embedding: [1, 0],
		embeddingModel: "model",
		isActive: true,
		isSavedTakeaway: false,
		hasCorrection: false,
		personMatchKey: null,
		factDate: null,
		needsReview: false,
		reviewMatchId: null,
	}
	const aired = { ...summary, id: "aired", text: "The episode aired in May.", embedding: [0.93, 0.37] }
	const runtime = { ...summary, id: "runtime", text: "The episode lasts 56 minutes.", embedding: [0.93, -0.37] }
	const approved = new Set([toTopicMemoryPairId(summary.id, aired.id), toTopicMemoryPairId(summary.id, runtime.id)])
	expect(
		toTopicMemoryCleanupGroups([summary, aired, runtime], approved).map((group) => group.map(({ id }) => id)),
	).toEqual([["aired", "episode"], ["runtime"]])
})

test("cleanup confirms the specific flagged pair, including when another neighbor is saved", () => {
	// the saved neighbor is visited first, but its pair never received a positive verdict
	const flagged = {
		id: "flagged",
		text: "Another takeaway",
		embedding: [1, 0],
		embeddingModel: "current",
		isActive: true,
		personMatchKey: null,
		factDate: null,
		needsReview: true,
		reviewMatchId: "matched",
		isSavedTakeaway: false,
		hasCorrection: false,
		firstSeenAt: new Date("2026-01-01"),
	}
	const unrelated = {
		...flagged,
		id: "unrelated",
		embedding: [0.86, 0.51],
		needsReview: false,
		reviewMatchId: null,
		isSavedTakeaway: true,
	}
	const matched = { ...unrelated, id: "matched", embedding: [0.91, -0.4146], isSavedTakeaway: false }
	const approved = new Set([toTopicMemoryPairId("flagged", "matched")])
	expect(
		toTopicMemoryCleanupGroups([flagged, unrelated, matched], approved).map((group) => group.map(({ id }) => id)),
	).toEqual([["unrelated"], ["flagged", "matched"]])
})

test.each([
	{
		name: "the two Wilson and Tao Chen career updates that the judge split",
		cosine: 0.984487,
		texts: [
			"Wilson Chen became Event & PR Supervisor for Mall Marketing at Taipei 101 after 11 years in marketing; Tao Chen completed his MIT robotics Ph.D. and runs Dexmate, which supplies robot platforms to university programs.",
			"Wilson Chen became Event & PR Supervisor for Mall Marketing at Taipei 101 after ~11 years in marketing (including EssenceMediacom); Tao Chen completed his MIT robotics Ph.D. in 2024 and runs Dexmate, which supplies robot platforms to university programs.",
		],
		groups: 1,
	},
	{
		name: "the generic query letter example and Bartz reference the judge called duplicate",
		cosine: 0.801653,
		texts: [
			"Successful query letters that led to agent signings (e.g. Stephanie Wrobel for Darling Rose Gold with Madeleine Milburn) provide word-for-word models and breakdowns of what works in pitching.",
			"A growing library of successful query letters published as models for aspiring authors: Andrea Bartz hosts a running list (~75 authors incl. Chandler Baker, Angie Kim, Kimberly McCreight, Zakiya Dalila Harris) plus individual breakdowns like Stephanie Wrobel (Darling Rose Gold, agent Madeleine Milburn) and 2026 signee Hannah Callan (2 offers / 50 queries in 29 days).",
		],
		groups: 2,
	},
	{
		name: "the separate September and November allegations about Balaji",
		cosine: 0.933956,
		texts: [
			"In late September 2026 Elon Musk revived a murder conspiracy theory about Suchir Balaji to attack OpenAI CEO Sam Altman.",
			"On 2026-11-16 Elon Musk escalated his feud with Sam Altman by again making the claim about Suchir Balaji.",
		],
		groups: 2,
	},
	{
		name: "otherwise identical Trump–Musk rift summaries with conflicting event dates",
		cosine: 0.985056,
		texts: [
			"Trump–Musk rift erupted publicly (around 2026-10-01 UTC), with the two trading insults over a Trump domestic policy Musk criticized.",
			"Trump–Musk rift erupted publicly on 2026-11-10 UTC, with the two trading insults over a Trump domestic policy Musk criticized.",
		],
		groups: 2,
	},
])("cleanup without model approval of $name", ({ cosine, texts, groups }) => {
	const memories = texts.map((text, index) => ({
		id: String(index),
		text,
		embedding: index === 0 ? [1, 0] : [cosine, Math.sqrt(1 - cosine ** 2)],
		embeddingModel: "current",
		isActive: true,
		personMatchKey: null,
		factDate: null,
		needsReview: index === 1,
		reviewMatchId: index === 1 ? "0" : null,
		isSavedTakeaway: false,
		hasCorrection: false,
		firstSeenAt: new Date(0),
	}))
	expect(toTopicMemoryCleanupGroups(memories, new Set())).toHaveLength(groups)
})

test("two near-identical links cannot combine an unconfirmed end pair", () => {
	const rows = [0, 10, 20].map((degrees) => ({
		text: "Near-identical wording",
		id: String(degrees).padStart(2, "0"),
		embedding: [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)],
		embeddingModel: "current",
		isActive: true,
		personMatchKey: null,
		factDate: null,
		needsReview: false,
		reviewMatchId: null,
		isSavedTakeaway: false,
		hasCorrection: false,
		firstSeenAt: new Date(0),
	}))
	expect(toTopicMemoryCleanupGroups(rows, new Set()).map((group) => group.map(({ id }) => id))).toEqual([
		["00", "10"],
		["20"],
	])
})

test("eviction uses Scan count recency while exempting pins and corrections", () => {
	const fresh = { id: "fresh", importance: 0.3, scansSinceLastSeen: 0, isSavedTakeaway: false, hasCorrection: false }
	const old = { ...fresh, id: "old", importance: 0.9, scansSinceLastSeen: 30 }
	const protectedRows = [
		{ ...old, id: "upvote", isSavedTakeaway: true },
		{ ...old, id: "correction", hasCorrection: true },
	]
	const fillers = Array.from({ length: TOPIC_MEMORY_ACTIVE_LIMIT - 2 }, (_, i) => ({
		...fresh,
		id: `filler-${i}`,
		importance: 1,
	}))
	expect(toEvictedTopicMemoryIds([...fillers, ...protectedRows, fresh, old])).toEqual(["old", "fresh"])
})
