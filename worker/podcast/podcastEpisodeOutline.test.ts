// podcast episode outline tests: the checks on an earlier outline draft, and the repairs that keep a last draft
import { expect, test } from "bun:test"
import { FULL_PODCAST_EPISODE_MINUTES, SHORT_PODCAST_EPISODE_MINUTES } from "@shared/podcastEpisodes"
import { toCheckedPodcastEpisodeOutline } from "./podcastEpisodeOutline"
import { RejectedScriptError } from "./podcastEpisodeScript"
import { outline, toOutline, toWords } from "./podcastEpisodeScriptFixtures"

// the ids of the two Findings that the outline plans, and the minute limit of a full Podcast Episode
const findingIds = ["finding-1", "finding-2"]
const maxMinutes = FULL_PODCAST_EPISODE_MINUTES

// the same Finding planned twice in one segment
const repeatedChapter = { findingId: "finding-1", minutes: 2 }
const repeatedOutline = { ...outline, segments: [{ theme: "gear", chapters: [repeatedChapter, repeatedChapter] }] }

// eleven chapters of three minutes each, 33 minutes in all
const longFindingIds = Array.from({ length: 11 }, (_, i) => `finding-${i}`)
const longChapters = longFindingIds.map((findingId) => ({ findingId, minutes: 3 }))
const longOutline = { ...outline, segments: [{ theme: "everything", chapters: longChapters }] }

test("toCheckedPodcastEpisodeOutline passes an outline that plans each Finding once", () => {
	expect(toCheckedPodcastEpisodeOutline({ outline, findingIds, maxMinutes })).toEqual(outline)
})

test("an earlier outline draft is rejected for an unknown or repeated Finding, a long plan, or long text", () => {
	// a Finding that was not in the input, the same Finding planned twice, and a full plan past thirty minutes
	expect(() => toCheckedPodcastEpisodeOutline({ outline, findingIds: ["finding-1"], maxMinutes })).toThrow(
		RejectedScriptError,
	)
	expect(() =>
		toCheckedPodcastEpisodeOutline({ outline: repeatedOutline, findingIds: ["finding-1"], maxMinutes }),
	).toThrow("twice")
	expect(() =>
		toCheckedPodcastEpisodeOutline({ outline: longOutline, findingIds: longFindingIds, maxMinutes }),
	).toThrow("33 minutes")

	// a short Podcast Episode's plan of two seven-minute chapters, past its ten minutes
	const fourteenMinuteChapters = findingIds.map((findingId) => ({ findingId, minutes: 7 }))
	const fourteenMinuteOutline = { ...outline, segments: [{ theme: "gear", chapters: fourteenMinuteChapters }] }
	const shortOutlineOptions = {
		outline: fourteenMinuteOutline,
		findingIds,
		maxMinutes: SHORT_PODCAST_EPISODE_MINUTES,
	}
	expect(() => toCheckedPodcastEpisodeOutline(shortOutlineOptions)).toThrow("14 minutes, over the 10 allowed")

	// a title past 60 characters and a description past 155
	const longTitleOutline = { ...outline, title: `${toWords(12)} title` }
	expect(() => toCheckedPodcastEpisodeOutline({ outline: longTitleOutline, findingIds, maxMinutes })).toThrow(
		"the title has 65",
	)
	const longDescriptionOutline = { ...outline, description: toWords(40) }
	expect(() => toCheckedPodcastEpisodeOutline({ outline: longDescriptionOutline, findingIds, maxMinutes })).toThrow(
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
	const checkedOutline = toCheckedPodcastEpisodeOutline({ outline: offRangeOutline, findingIds, maxMinutes })
	expect(checkedOutline.segments[0]?.chapters.map((chapter) => chapter.minutes)).toEqual([1, 8])
})

test("the last outline draft is repaired instead of rejected, and fails only with nothing to narrate", () => {
	// a long title and description are cut at a word boundary and end in an ellipsis
	const longTextOutline = { ...outline, title: toWords(20), description: toWords(40) }
	const cutOutline = toCheckedPodcastEpisodeOutline({
		outline: longTextOutline,
		findingIds,
		maxMinutes,
		isLastScriptDraft: true,
	})
	expect(cutOutline.title.length).toBeLessThanOrEqual(60)
	expect(cutOutline.title.endsWith("word\u2026")).toBe(true)
	expect(cutOutline.description.length).toBeLessThanOrEqual(155)

	// a repeated Finding is planned once, an unknown one is left out, and a plan past thirty minutes is kept
	const unknownFindingOutline = toOutline(["finding-1", "finding-9"])
	const repairedOutline = toCheckedPodcastEpisodeOutline({
		outline: unknownFindingOutline,
		findingIds,
		maxMinutes,
		isLastScriptDraft: true,
	})
	expect(repairedOutline.segments[0]?.chapters.map((chapter) => chapter.findingId)).toEqual(["finding-1"])
	const lastRepeatedOutlineOptions = { outline: repeatedOutline, findingIds, maxMinutes, isLastScriptDraft: true }
	expect(toCheckedPodcastEpisodeOutline(lastRepeatedOutlineOptions).segments[0]?.chapters).toHaveLength(1)
	const lastLongOutlineOptions = {
		outline: longOutline,
		findingIds: longFindingIds,
		maxMinutes,
		isLastScriptDraft: true,
	}
	expect(toCheckedPodcastEpisodeOutline(lastLongOutlineOptions).segments[0]?.chapters).toHaveLength(11)

	// an outline that plans no Finding from its input has nothing to narrate
	const unknownFindingOnlyOutlineOptions = {
		outline: toOutline(["finding-9"]),
		findingIds,
		maxMinutes,
		isLastScriptDraft: true,
	}
	expect(() => toCheckedPodcastEpisodeOutline(unknownFindingOnlyOutlineOptions)).toThrow("no finding from its input")
})
