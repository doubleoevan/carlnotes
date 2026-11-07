// score example page tests: the order of the liked pages, the thumbs down that removes one, each Finding's weighted
// reaction signal, and the shared comments the score text reads
import { expect, test } from "bun:test"
import { type ReactionSignalRow, toFindingReactionSignals } from "./reactionSignals"
import { toScoreExamplePages } from "./scoreExamplePages"
import { toScoreContextText } from "./topicContext"

// a finding's page row, and one thing a user did on a finding as the signal reads it
function toFindingRow(
	findingId: string,
	rating: "up" | "down" | null = null,
): { findingId: string; title: string; url: string; rating: "up" | "down" | null } {
	return { findingId, title: `Page ${findingId}`, url: `https://example.org/${findingId}`, rating }
}
function toSignalRow(
	findingId: string,
	userId: string,
	kind: ReactionSignalRow["kind"] = "reaction",
): ReactionSignalRow {
	return { findingId, userId, kind }
}

// an established account weighs 1, and an account in its first week weighs a fifth
const ESTABLISHED_WEIGHTS = new Map([["established", 1]])
const NEW_ACCOUNT_IDS = Array.from({ length: 10 }, (_unused, index) => `new-${index}`)
const NEW_ACCOUNT_WEIGHTS = new Map(NEW_ACCOUNT_IDS.map((userId) => [userId, 1 / 5]))

test("a comment from an established account reaches the minimum, and a reaction alone does not", () => {
	const findingReactionSignals = toFindingReactionSignals(
		[toSignalRow("with-comment", "established", "comment"), toSignalRow("reaction-only", "established")],
		ESTABLISHED_WEIGHTS,
	)
	expect(findingReactionSignals.get("with-comment")).toBe(2)
	expect(findingReactionSignals.get("reaction-only")).toBe(1)
})

test("five new accounts stay under the minimum and ten reach it", () => {
	// each new account reacts to the same Finding
	const toReactionSignal = (accountCount: number): number =>
		toFindingReactionSignals(
			NEW_ACCOUNT_IDS.slice(0, accountCount).map((userId) => toSignalRow("finding-1", userId)),
			NEW_ACCOUNT_WEIGHTS,
		).get("finding-1") ?? 0
	expect(toReactionSignal(5)).toBeCloseTo(1)
	expect(toReactionSignal(10)).toBeCloseTo(2)
})

test("an author with no weight counts for nothing, and a reaction and a comment add up", () => {
	const findingReactionSignals = toFindingReactionSignals(
		[
			toSignalRow("finding-1", "unknown", "comment"),
			toSignalRow("finding-1", "established"),
			toSignalRow("finding-1", "established", "comment"),
		],
		ESTABLISHED_WEIGHTS,
	)
	expect(findingReactionSignals.get("finding-1")).toBe(3)
})

test("the liked pages are the bookmarked, then the strongest signals, then the thumbs up", () => {
	const { likedOrBookmarkedPages } = toScoreExamplePages({
		bookmarkedFindingRows: [toFindingRow("bookmarked")],
		ratedOrReactedFindingRows: [
			toFindingRow("thumbs-up", "up"),
			toFindingRow("weak-signal"),
			toFindingRow("signal"),
			toFindingRow("strong-signal", "up"),
			toFindingRow("bookmarked"),
		],
		findingReactionSignals: new Map([
			["signal", 2],
			["strong-signal", 6],
			["weak-signal", 1],
			["bookmarked", 4],
		]),
	})
	expect(likedOrBookmarkedPages.map((page) => page.title)).toEqual([
		"Page bookmarked",
		"Page strong-signal",
		"Page signal",
		"Page thumbs-up",
	])
})

test("a thumbs down removes a page from the liked ones, whatever its signal", () => {
	const { likedOrBookmarkedPages, ratedDownPages } = toScoreExamplePages({
		bookmarkedFindingRows: [toFindingRow("rated-down")],
		ratedOrReactedFindingRows: [toFindingRow("rated-down", "down")],
		findingReactionSignals: new Map([["rated-down", 10]]),
	})
	expect(likedOrBookmarkedPages).toEqual([])
	expect(ratedDownPages).toEqual([{ title: "Page rated-down", url: "https://example.org/rated-down" }])
})

test("the score text lists the example pages, then the shared comments on one line each, and no other words", () => {
	// a liked page with a signal, and the comments the editors shared, one of them Carl's own
	const scoreExamplePages = toScoreExamplePages({
		bookmarkedFindingRows: [],
		ratedOrReactedFindingRows: [toFindingRow("finding-1")],
		findingReactionSignals: toFindingReactionSignals(
			[toSignalRow("finding-1", "established", "comment")],
			ESTABLISHED_WEIGHTS,
		),
	})
	expect(toScoreContextText("the context", scoreExamplePages)).toBe(
		"the context\n\n[pages the reader liked or bookmarked]\n- Page finding-1 (example.org)",
	)
	expect(
		toScoreContextText("the context", scoreExamplePages, [
			{ username: "roastfan", body: "worth\nreading" },
			{ username: null, body: "three of you bookmarked this" },
		]),
	).toBe(
		[
			"the context",
			"[pages the reader liked or bookmarked]\n- Page finding-1 (example.org)",
			"[what people said about this topic, shared by its editors]\n- roastfan: worth reading\n- Carl: three of you bookmarked this",
		].join("\n\n"),
	)
})
