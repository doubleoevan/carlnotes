// podcast episode script tests: the outline and segment checks, the repairs that keep a last draft,
// the whole script, and each chapter's turns
import { expect, test } from "bun:test"
import type { PodcastEpisodeChapterScript, PodcastEpisodeTurn } from "@shared/contracts"
import {
	type PodcastEpisodeOutline,
	type PodcastEpisodeSegment,
	RejectedScriptError,
	toChapterTurns,
	toCheckedPodcastEpisodeOutline,
	toCheckedPodcastEpisodeSegment,
	toPodcastEpisodeScript,
	toRenderedPodcastEpisodeScript,
	toScriptMinutes,
} from "./podcastEpisodeScript"

// an outline that plans both Findings in one segment
const outline: PodcastEpisodeOutline = {
	title: "A quieter grinder, and your water",
	description: "A quieter burr set, and why hard water sours a shot.",
	segments: [
		{
			theme: "gear and water",
			chapters: [
				{ findingId: "finding-1", minutes: 2 },
				{ findingId: "finding-2", minutes: 1 },
			],
		},
	],
}

// one host turn of the given text
function toHostTurn(text: string): PodcastEpisodeTurn {
	return { speaker: "host", text }
}

// a segment with one chapter for each Finding, a cold open, and a sign-off. the first chapter has the given text
function toSegment(firstChapterText = "The grinder is quieter now."): PodcastEpisodeSegment {
	return {
		coldOpen: [toHostTurn("Your grinder just got quieter.")],
		transition: [],
		chapters: [
			{ findingId: "finding-1", title: "A quieter grinder", turns: [toHostTurn(firstChapterText)] },
			{ findingId: "finding-2", title: "Hard water", turns: [toHostTurn("Hard water sours the shot.")] },
		],
		signOff: [toHostTurn("That is the lot.")],
	}
}

// an outline of one segment that plans the given Findings
function toOutline(findingIds: string[]): PodcastEpisodeOutline {
	const chapters = findingIds.map((findingId) => ({ findingId, minutes: 2 }))
	return { ...outline, segments: [{ theme: "gear and water", chapters }] }
}

// a text of the given number of words
function toWords(wordCount: number): string {
	return Array.from({ length: wordCount }, () => "word").join(" ")
}

// the ids of the two Findings that the outline plans
const findingIds = ["finding-1", "finding-2"]

// the same Finding planned twice in one segment
const repeatedChapter = { findingId: "finding-1", minutes: 2 }
const repeatedOutline = { ...outline, segments: [{ theme: "gear", chapters: [repeatedChapter, repeatedChapter] }] }

// eleven chapters of three minutes each, 33 minutes in all
const longFindingIds = Array.from({ length: 11 }, (_, i) => `finding-${i}`)
const longChapters = longFindingIds.map((findingId) => ({ findingId, minutes: 3 }))
const longOutline = { ...outline, segments: [{ theme: "everything", chapters: longChapters }] }

test("toCheckedPodcastEpisodeOutline passes an outline that plans each Finding once", () => {
	expect(toCheckedPodcastEpisodeOutline({ outline, findingIds })).toEqual(outline)
})

test("an earlier outline draft is rejected for an unknown or repeated Finding, a long plan, or long text", () => {
	// a Finding that was not in the input, the same Finding planned twice, and a plan past thirty minutes
	expect(() => toCheckedPodcastEpisodeOutline({ outline, findingIds: ["finding-1"] })).toThrow(RejectedScriptError)
	expect(() => toCheckedPodcastEpisodeOutline({ outline: repeatedOutline, findingIds: ["finding-1"] })).toThrow("twice")
	expect(() => toCheckedPodcastEpisodeOutline({ outline: longOutline, findingIds: longFindingIds })).toThrow(
		"33 minutes",
	)

	// a title past 60 characters and a description past 155
	const longTitleOutline = { ...outline, title: `${toWords(12)} title` }
	expect(() => toCheckedPodcastEpisodeOutline({ outline: longTitleOutline, findingIds })).toThrow("the title has 65")
	const longDescriptionOutline = { ...outline, description: toWords(40) }
	expect(() => toCheckedPodcastEpisodeOutline({ outline: longDescriptionOutline, findingIds })).toThrow(
		"the description has 199",
	)
})

test("every outline draft has its planned lengths kept between one and eight minutes, with no rejection", () => {
	// a half-minute chapter and a twelve-minute chapter
	const offRangeChapters = [
		{ findingId: "finding-1", minutes: 0.5 },
		{ findingId: "finding-2", minutes: 12 },
	]
	const offRangeOutline = { ...outline, segments: [{ theme: "gear", chapters: offRangeChapters }] }
	const checkedOutline = toCheckedPodcastEpisodeOutline({ outline: offRangeOutline, findingIds })
	expect(checkedOutline.segments[0]?.chapters.map((chapter) => chapter.minutes)).toEqual([1, 8])
})

test("the last outline draft is repaired instead of rejected, and fails only with nothing to narrate", () => {
	// a long title and description are cut at a word boundary and end in an ellipsis
	const longTextOutline = { ...outline, title: toWords(20), description: toWords(40) }
	const cutOutline = toCheckedPodcastEpisodeOutline({ outline: longTextOutline, findingIds, isLastScriptDraft: true })
	expect(cutOutline.title.length).toBeLessThanOrEqual(60)
	expect(cutOutline.title.endsWith("word\u2026")).toBe(true)
	expect(cutOutline.description.length).toBeLessThanOrEqual(155)

	// a repeated Finding is planned once, an unknown one is left out, and a plan past thirty minutes is kept
	const unknownFindingOutline = toOutline(["finding-1", "finding-9"])
	const repairedOutline = toCheckedPodcastEpisodeOutline({
		outline: unknownFindingOutline,
		findingIds,
		isLastScriptDraft: true,
	})
	expect(repairedOutline.segments[0]?.chapters.map((chapter) => chapter.findingId)).toEqual(["finding-1"])
	const lastRepeatedOutlineOptions = { outline: repeatedOutline, findingIds, isLastScriptDraft: true }
	expect(toCheckedPodcastEpisodeOutline(lastRepeatedOutlineOptions).segments[0]?.chapters).toHaveLength(1)
	const lastLongOutlineOptions = { outline: longOutline, findingIds: longFindingIds, isLastScriptDraft: true }
	expect(toCheckedPodcastEpisodeOutline(lastLongOutlineOptions).segments[0]?.chapters).toHaveLength(11)

	// an outline that plans no Finding from its input has nothing to narrate
	const unknownFindingOnlyOutlineOptions = { outline: toOutline(["finding-9"]), findingIds, isLastScriptDraft: true }
	expect(() => toCheckedPodcastEpisodeOutline(unknownFindingOnlyOutlineOptions)).toThrow("no finding from its input")
})

test("toCheckedPodcastEpisodeSegment passes a segment with one chapter for each of its Findings", () => {
	expect(() => toCheckedPodcastEpisodeSegment({ segment: toSegment(), outline, segmentIndex: 0 })).not.toThrow()
})

test("toCheckedPodcastEpisodeSegment rejects an unknown Finding and a missing one", () => {
	// a chapter for a Finding outside the segment
	expect(() =>
		toCheckedPodcastEpisodeSegment({ segment: toSegment(), outline: toOutline(["finding-1"]), segmentIndex: 0 }),
	).toThrow("not in its input")

	// no chapter for a Finding that the outline gave the segment
	const longerOutline = toOutline(["finding-1", "finding-2", "finding-3"])
	expect(() =>
		toCheckedPodcastEpisodeSegment({ segment: toSegment(), outline: longerOutline, segmentIndex: 0 }),
	).toThrow("one chapter for each")
})

test("toCheckedPodcastEpisodeSegment keeps a chapter past three minutes", () => {
	// 451 words run past three minutes at 150 words a minute, and both chapters stay
	const checkedSegment = toCheckedPodcastEpisodeSegment({ segment: toSegment(toWords(451)), outline, segmentIndex: 0 })
	expect(checkedSegment.chapters).toHaveLength(2)
})

test("toScriptMinutes counts no inline tag as a word", () => {
	// the same chapter with and without a tag runs the same length
	const taggedMinutes = toScriptMinutes(toPodcastEpisodeScript([toSegment(`${toWords(150)} <short pause>`)]))
	const plainMinutes = toScriptMinutes(toPodcastEpisodeScript([toSegment(toWords(150))]))
	expect(taggedMinutes).toBe(plainMinutes)
})

test("toCheckedPodcastEpisodeSegment allows three short quotes and rejects a fourth or a long one", () => {
	// three attributed sentences, and a quoted title beside them
	const oneQuote = 'The maker said "this burr set is the quietest we have built" in a post called "Quiet Burrs".'
	const threeQuotes = `${oneQuote} They added “it took us three years to get here” and "we threw the first two designs away".`
	expect(() =>
		toCheckedPodcastEpisodeSegment({ segment: toSegment(threeQuotes), outline, segmentIndex: 0 }),
	).not.toThrow()

	// four quoted sentences in one chapter, and the rejection names the quote count, the longest quote, and the limits
	const fourQuotes = `${threeQuotes} A reviewer wrote "it is the first grinder I can run at dawn".`
	expect(() => toCheckedPodcastEpisodeSegment({ segment: toSegment(fourQuotes), outline, segmentIndex: 0 })).toThrow(
		"quotes its source too much. quotes: 4, longest quote: 10 words. a chapter may have 3 quotes of up to 30 words",
	)

	// one quote of 31 words
	const longQuote = `The maker said "${toWords(31)}" in the post.`
	expect(() => toCheckedPodcastEpisodeSegment({ segment: toSegment(longQuote), outline, segmentIndex: 0 })).toThrow(
		"quotes its source too much. quotes: 1, longest quote: 31 words",
	)
})

test("the last segment draft leaves out a chapter that quotes too much, and a script needs a chapter", () => {
	// the first chapter has a quote of 31 words, which an earlier draft is rejected for
	const overQuotedSegment = toSegment(`The maker said "${toWords(31)}" in the post.`)

	// check the segment as the last draft
	const checkedSegment = toCheckedPodcastEpisodeSegment({
		segment: overQuotedSegment,
		outline,
		segmentIndex: 0,
		isLastScriptDraft: true,
	})

	// the last draft keeps the other chapter, the cold open, and the sign-off
	expect(checkedSegment.chapters.map((chapter) => chapter.findingId)).toEqual(["finding-2"])
	expect(checkedSegment.coldOpen).toHaveLength(1)
	expect(toPodcastEpisodeScript([checkedSegment]).segments[0]?.chapters).toHaveLength(1)

	// a segment with no chapter left is not in the script, and a script with no chapter at all is rejected
	const emptySegment = { ...toSegment(), chapters: [] }
	expect(toPodcastEpisodeScript([emptySegment, toSegment()]).segments).toHaveLength(1)
	expect(() => toPodcastEpisodeScript([emptySegment])).toThrow("the script has no chapter")
})

test("the last segment draft is repaired instead of rejected", () => {
	// a chapter for a Finding outside the segment and a second chapter for one Finding are left out
	const outsideFindingSegment = toSegment()
	const repairedChapters = toCheckedPodcastEpisodeSegment({
		segment: outsideFindingSegment,
		outline: toOutline(["finding-1"]),
		segmentIndex: 0,
		isLastScriptDraft: true,
	}).chapters
	expect(repairedChapters.map((chapter) => chapter.findingId)).toEqual(["finding-1"])
	const [firstChapter] = outsideFindingSegment.chapters
	const repeatedSegment = { ...outsideFindingSegment, chapters: firstChapter ? [firstChapter, firstChapter] : [] }
	const repeatedSegmentOptions = { segment: repeatedSegment, outline, segmentIndex: 0, isLastScriptDraft: true }
	expect(toCheckedPodcastEpisodeSegment(repeatedSegmentOptions).chapters).toHaveLength(1)

	// a missing chapter, a missing cold open, and a missing sign-off are accepted
	const longerOutline = toOutline(["finding-1", "finding-2", "finding-3"])
	const bareSegment = { ...toSegment(), coldOpen: undefined, signOff: undefined }
	const bareSegmentOptions = { segment: bareSegment, outline: longerOutline, segmentIndex: 0, isLastScriptDraft: true }
	expect(toCheckedPodcastEpisodeSegment(bareSegmentOptions).chapters).toHaveLength(2)
})

test("every segment draft has its long chapter titles cut, with no rejection", () => {
	// a chapter title past 80 characters, on an earlier draft
	const longTitleSegment = toSegment()
	const [firstChapter, secondChapter] = longTitleSegment.chapters
	const longTitleChapters =
		firstChapter && secondChapter ? [{ ...firstChapter, title: toWords(20) }, secondChapter] : []
	const checkedSegment = toCheckedPodcastEpisodeSegment({
		segment: { ...longTitleSegment, chapters: longTitleChapters },
		outline,
		segmentIndex: 0,
	})
	expect(checkedSegment.chapters[0]?.title.length).toBeLessThanOrEqual(80)
})

test("toCheckedPodcastEpisodeSegment rejects a first segment with no cold open and a last with no sign-off", () => {
	// the cold open belongs to the first segment
	expect(() =>
		toCheckedPodcastEpisodeSegment({ segment: { ...toSegment(), coldOpen: [] }, outline, segmentIndex: 0 }),
	).toThrow("the first segment has no cold open")
	expect(() =>
		toCheckedPodcastEpisodeSegment({ segment: { ...toSegment(), signOff: undefined }, outline, segmentIndex: 0 }),
	).toThrow("the last segment has no sign-off")

	// a middle segment needs no cold open and no sign-off
	const [segment] = outline.segments
	const threeSegmentOutline = { ...outline, segments: segment ? [segment, segment, segment] : [] }
	const middleSegment = { ...toSegment(), coldOpen: undefined, signOff: undefined }
	expect(() =>
		toCheckedPodcastEpisodeSegment({ segment: middleSegment, outline: threeSegmentOutline, segmentIndex: 1 }),
	).not.toThrow()
})

test("toPodcastEpisodeScript ends on the writer's closing turns, then the goodbye", () => {
	// the sign-off is the last segment's closing turns, then the goodbye with each line's speaker
	const segment = toSegment()
	const closingTurns = segment.signOff ?? []
	const podcastEpisodeScript = toPodcastEpisodeScript([segment])
	expect(podcastEpisodeScript.signOff.slice(0, closingTurns.length)).toEqual(closingTurns)
	const goodbyeTurns = podcastEpisodeScript.signOff.slice(closingTurns.length)
	expect(goodbyeTurns.map((turn) => `${turn.speaker}: ${turn.text}`)).toEqual([
		"host: I've got more reading to do.",
		"cohost: You always do.",
		"host: Another great coffee break.",
		"cohost: Was it as good for you as it was for me?",
		"host: Not in front of the Raccoon.",
		"cohost: See you next coffee break.",
	])

	// the cold open and the chapters are the segment's own
	expect(podcastEpisodeScript.coldOpen).toHaveLength(1)
	expect(podcastEpisodeScript.segments[0]?.chapters).toHaveLength(2)

	// a script with no cold open and no sign-off still ends on the goodbye
	const bareScript = toPodcastEpisodeScript([{ ...toSegment(), coldOpen: undefined, signOff: undefined }])
	expect(bareScript.coldOpen).toHaveLength(0)
	expect(bareScript.signOff).toEqual(goodbyeTurns)
})

test("toPodcastEpisodeScript keeps a script past thirty minutes", () => {
	// eleven segments of about 450 words each run about 33 minutes, and every segment stays
	const longSegments = Array.from({ length: 11 }, () => toSegment(toWords(445)))
	const longScript = toPodcastEpisodeScript(longSegments)
	expect(longScript.segments).toHaveLength(11)
	expect(toScriptMinutes(longScript)).toBeGreaterThan(30)
	expect(toScriptMinutes(toPodcastEpisodeScript([toSegment()]))).toBeLessThan(1)
})

test("toRenderedPodcastEpisodeScript leaves out each chapter that did not render, with the turns that render with it", () => {
	// two segments of two and one chapters, each turn named for where it sits
	const toChapter = (name: string): PodcastEpisodeChapterScript => ({
		findingId: name,
		title: name,
		turns: [toHostTurn(name)],
	})
	const podcastEpisodeScript = {
		coldOpen: [toHostTurn("cold open")],
		segments: [
			{ transition: [toHostTurn("first transition")], chapters: [toChapter("first"), toChapter("middle")] },
			{ transition: [toHostTurn("last transition")], chapters: [toChapter("last")] },
		],
		signOff: [toHostTurn("sign-off")],
	}

	// every chapter rendered, so the script is kept whole
	expect(toRenderedPodcastEpisodeScript(podcastEpisodeScript, [0, 1, 2])).toEqual(podcastEpisodeScript)

	// the first chapter is left out with the cold open and its segment's transition, and the rest renders as before
	const withoutFirstChapterScript = toRenderedPodcastEpisodeScript(podcastEpisodeScript, [1, 2])
	const withoutFirstChapterTexts = toChapterTurns(withoutFirstChapterScript).map((turns) =>
		turns.map((turn) => turn.text),
	)
	expect(withoutFirstChapterTexts).toEqual([["middle"], ["last transition", "last", "sign-off"]])

	// the last chapter is left out with its segment and the sign-off
	const withoutLastChapterScript = toRenderedPodcastEpisodeScript(podcastEpisodeScript, [0, 1])
	expect(withoutLastChapterScript.segments).toHaveLength(1)
	expect(withoutLastChapterScript.signOff).toHaveLength(0)
	expect(withoutLastChapterScript.coldOpen).toHaveLength(1)
})

test("toChapterTurns joins the cold open, each transition, and the sign-off to the chapter beside each", () => {
	// two segments of two and one chapters, each turn named for where it sits
	const toChapter = (name: string): PodcastEpisodeChapterScript => ({
		findingId: name,
		title: name,
		turns: [toHostTurn(name)],
	})
	const chapterTurns = toChapterTurns({
		coldOpen: [toHostTurn("cold open")],
		segments: [
			{ transition: [], chapters: [toChapter("first"), toChapter("middle")] },
			{ transition: [toHostTurn("transition")], chapters: [toChapter("last")] },
		],
		signOff: [toHostTurn("sign-off")],
	})

	// every turn of the script is in exactly one chapter, in order
	const chapterTexts = chapterTurns.map((turns) => turns.map((turn) => turn.text))
	expect(chapterTexts).toEqual([["cold open", "first"], ["middle"], ["transition", "last", "sign-off"]])
})
