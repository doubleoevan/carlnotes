// a Podcast Episode's script. its shape and limits, the checks on an earlier draft, the repairs of a last draft,
// and the script built from the checked segments
import {
	PODCAST_EPISODE_DESCRIPTION_MAX_CHARS,
	PODCAST_EPISODE_TITLE_MAX_CHARS,
	type PodcastEpisodeChapterScript,
	type PodcastEpisodeScript,
	type PodcastEpisodeTurn,
	podcastEpisodeChapterScriptPayload,
	podcastEpisodeTurnPayload,
} from "@shared/contracts"
import { toTranscriptText } from "@shared/podcastEpisodes"
import { z } from "zod"

// how many words the hosts speak in a minute
const WORDS_PER_MINUTE = 150

// the most minutes that an outline may plan for a Podcast Episode and for one chapter, and the fewest for a chapter.
// a chapter and the turns that render with it fit one speech request of about eleven minutes. a script may run long
export const MAX_PODCAST_EPISODE_MINUTES = 30
const MAX_PLANNED_CHAPTER_MINUTES = 8
const MIN_PLANNED_CHAPTER_MINUTES = 1

// the most characters that a chapter's title may have. a longer title is cut
const MAX_CHAPTER_TITLE_CHARS = 80

// the fewest and the most words in a quote, and the most quotes in a chapter.
// shorter quoted text, such as a title or a single word, is not counted as a quote
const MIN_QUOTE_WORDS = 6
const MAX_QUOTE_WORDS = 30
const MAX_CHAPTER_QUOTES = 3

// the text inside straight or curly double quotation marks
const QUOTED_TEXT_PATTERN = /["“]([^"“”]+)["”]/g

// the turns that open every Podcast Episode's goodbye, after the last segment's sign-off
export const GOODBYE_OPENING_TURNS: PodcastEpisodeTurn[] = [
	{ speaker: "host", text: "Well, I've got more reading to do." },
	{ speaker: "cohost", text: "You always do." },
]

// one Finding as a script prompt lists it
export type PodcastEpisodeFinding = {
	findingId: string
	title: string
	sourceHost: string
	snippet: string
	relevanceExplanation: string
	content: string
}

// the outline that the first call writes. the Podcast Episode's title and description, and its segments in order.
// each chapter has the number that its Finding is listed under and its minutes. the checks below apply the limits
export const podcastEpisodeOutlinePayload = z.object({
	title: z.string().trim().min(1),
	description: z.string().trim().min(1),
	segments: z
		.array(
			z.object({
				theme: z.string().trim().min(1),
				chapters: z.array(z.object({ findingNumber: z.number().int(), minutes: z.number() })).min(1),
			}),
		)
		.min(1),
})
export type PodcastEpisodeOutlinePayload = z.infer<typeof podcastEpisodeOutlinePayload>

// the outline with each chapter's Finding number mapped back to the Finding's id
export type PodcastEpisodeOutline = Omit<PodcastEpisodeOutlinePayload, "segments"> & {
	segments: { theme: string; chapters: { findingId: string; minutes: number }[] }[]
}

// what one segment call writes. the transition into the segment and its chapters, each with its Finding's number.
// the first segment also has the cold open, and the last segment also has the sign-off and the goodbye
export const podcastEpisodeSegmentPayload = z.object({
	coldOpen: z.array(podcastEpisodeTurnPayload).optional(),
	transition: z.array(podcastEpisodeTurnPayload),
	chapters: z
		.array(podcastEpisodeChapterScriptPayload.omit({ findingId: true }).extend({ findingNumber: z.number().int() }))
		.min(1),
	signOff: z.array(podcastEpisodeTurnPayload).optional(),
	goodbye: z.array(podcastEpisodeTurnPayload).optional(),
})
export type PodcastEpisodeSegmentPayload = z.infer<typeof podcastEpisodeSegmentPayload>

// the segment with each chapter's Finding number mapped back to the Finding's id
export type PodcastEpisodeSegment = Omit<PodcastEpisodeSegmentPayload, "chapters"> & {
	chapters: PodcastEpisodeChapterScript[]
}

// a script draft, or a whole script, that failed a check
export class RejectedScriptError extends Error {}

// an outline draft to check, the ids of the Findings that its prompt listed, and whether it is the call's last draft
export type ToCheckedPodcastEpisodeOutlineOptions = {
	outline: PodcastEpisodeOutline
	findingIds: string[]
	isLastScriptDraft?: boolean
}

// a segment draft to check, the outline, the segment's index, and whether it is the call's last draft
export type ToCheckedPodcastEpisodeSegmentOptions = {
	segment: PodcastEpisodeSegment
	outline: PodcastEpisodeOutline
	segmentIndex: number
	isLastScriptDraft?: boolean
}

/**
 * Returns the checked outline, or the repaired last draft, and throws a RejectedScriptError if the draft fails.
 */
export function toCheckedPodcastEpisodeOutline({
	outline,
	findingIds,
	isLastScriptDraft = false,
}: ToCheckedPodcastEpisodeOutlineOptions): PodcastEpisodeOutline {
	// keep each planned length between one and eight minutes
	const segments = outline.segments.map((segment) => ({
		...segment,
		chapters: segment.chapters.map((chapter) => ({
			...chapter,
			minutes: Math.min(MAX_PLANNED_CHAPTER_MINUTES, Math.max(MIN_PLANNED_CHAPTER_MINUTES, chapter.minutes)),
		})),
	}))
	const limitedOutline = { ...outline, segments }

	// repair the last draft, and reject an earlier draft that fails a check
	if (isLastScriptDraft) {
		return toRepairedPodcastEpisodeOutline(limitedOutline, findingIds)
	}
	checkPodcastEpisodeOutline(limitedOutline, findingIds)
	return limitedOutline
}

/**
 * Returns the checked segment, or the repaired last draft, and throws a RejectedScriptError if an earlier draft fails.
 */
export function toCheckedPodcastEpisodeSegment({
	segment,
	outline,
	segmentIndex,
	isLastScriptDraft = false,
}: ToCheckedPodcastEpisodeSegmentOptions): PodcastEpisodeSegment {
	// cut each chapter title past its limit
	const chapters = segment.chapters.map((chapter) => ({
		...chapter,
		title: toClippedText(chapter.title, MAX_CHAPTER_TITLE_CHARS),
	}))
	const limitedSegment = { ...segment, chapters }
	const outlinedFindingIds = outline.segments[segmentIndex]?.chapters.map((chapter) => chapter.findingId) ?? []

	// repair the last draft, and reject an earlier draft that fails a check
	if (isLastScriptDraft) {
		return toRepairedPodcastEpisodeSegment(limitedSegment, outlinedFindingIds)
	}
	checkPodcastEpisodeSegment({
		segment: limitedSegment,
		outlinedFindingIds,
		isFirstSegment: segmentIndex === 0,
		isLastSegment: segmentIndex === outline.segments.length - 1,
	})
	return limitedSegment
}

/**
 * Builds the script from the segments that have a chapter, ending on the last segment's sign-off and goodbye.
 * Throws a RejectedScriptError if no segment has a chapter.
 */
export function toPodcastEpisodeScript(segments: PodcastEpisodeSegment[]): PodcastEpisodeScript {
	// leave out each segment with no chapter, and reject a script with no chapter
	const narratedSegments = segments.filter((segment) => segment.chapters.length > 0)
	if (narratedSegments.length === 0) {
		throw new RejectedScriptError("the script has no chapter")
	}

	// return the first segment's cold open, the narrated segments, and the last segment's sign-off,
	// then the goodbye's opening turns and the last segment's goodbye
	const lastSegment = segments.at(-1)
	return {
		coldOpen: segments[0]?.coldOpen ?? [],
		segments: narratedSegments.map(({ transition, chapters }) => ({ transition, chapters })),
		signOff: [...(lastSegment?.signOff ?? []), ...GOODBYE_OPENING_TURNS, ...(lastSegment?.goodbye ?? [])],
	}
}

/**
 * Returns a goodbye opening turn's text without its end punctuation.
 */
export function toGoodbyeOpeningLine(goodbyeOpeningTurn: PodcastEpisodeTurn): string {
	return goodbyeOpeningTurn.text.replace(/[.!?]+$/, "")
}

/**
 * Checks whether a turn repeats a goodbye opening turn, ignoring case, end punctuation, and a leading "well".
 */
export function isRepeatedGoodbyeOpeningTurn(turn: PodcastEpisodeTurn): boolean {
	const turnText = toComparableTurnText(turn)
	return GOODBYE_OPENING_TURNS.some((goodbyeOpeningTurn) => turnText.includes(toComparableTurnText(goodbyeOpeningTurn)))
}

// a turn's text in lower case, without its end punctuation and a leading "well"
function toComparableTurnText(turn: PodcastEpisodeTurn): string {
	return toGoodbyeOpeningLine(turn)
		.toLowerCase()
		.replace(/^well,?\s+/, "")
}

/**
 * Returns how long a script runs in minutes, estimated from its word count.
 */
export function toScriptMinutes(podcastEpisodeScript: PodcastEpisodeScript): number {
	const segmentTurns = podcastEpisodeScript.segments.flatMap((segment) => [
		...segment.transition,
		...segment.chapters.flatMap((chapter) => chapter.turns),
	])
	return toTurnMinutes([...podcastEpisodeScript.coldOpen, ...segmentTurns, ...podcastEpisodeScript.signOff])
}

/**
 * Returns each chapter's turns as they render, with the cold open, each transition, and the sign-off in their chapters.
 */
export function toChapterTurns(podcastEpisodeScript: PodcastEpisodeScript): PodcastEpisodeTurn[][] {
	// join each segment's transition to its first chapter
	const chapterTurns = podcastEpisodeScript.segments.flatMap((segment) =>
		segment.chapters.map((chapter, i) => [...(i === 0 ? segment.transition : []), ...chapter.turns]),
	)

	// add the cold open to the first chapter and the sign-off to the last chapter
	const lastPosition = chapterTurns.length - 1
	return chapterTurns.map((turns, position) => [
		...(position === 0 ? podcastEpisodeScript.coldOpen : []),
		...turns,
		...(position === lastPosition ? podcastEpisodeScript.signOff : []),
	])
}

/**
 * Returns the script without each chapter whose audio did not render and without the turns that render with it.
 */
export function toRenderedPodcastEpisodeScript(
	podcastEpisodeScript: PodcastEpisodeScript,
	renderedChapterPositions: number[],
): PodcastEpisodeScript {
	// keep each rendered chapter, and a segment's transition only if the segment's first chapter rendered.
	// the count of the chapters before a segment is the position of the segment's first chapter
	const isChapterRendered = (position: number): boolean => renderedChapterPositions.includes(position)
	let chapterCount = 0
	const renderedSegments = podcastEpisodeScript.segments.map((segment) => {
		const renderedSegment = {
			transition: isChapterRendered(chapterCount) ? segment.transition : [],
			chapters: segment.chapters.filter((_, i) => isChapterRendered(chapterCount + i)),
		}
		chapterCount += segment.chapters.length
		return renderedSegment
	})

	// keep the cold open only if the first chapter rendered, and the sign-off only if the last chapter rendered
	const lastPosition = chapterCount - 1
	return {
		coldOpen: isChapterRendered(0) ? podcastEpisodeScript.coldOpen : [],
		segments: renderedSegments.filter((segment) => segment.chapters.length > 0),
		signOff: isChapterRendered(lastPosition) ? podcastEpisodeScript.signOff : [],
	}
}

// throw a RejectedScriptError if the title or the description is too long, a Finding is unknown or planned twice,
// or the plan runs longer than a Podcast Episode may run
function checkPodcastEpisodeOutline(outline: PodcastEpisodeOutline, findingIds: string[]): void {
	// reject a title or a description past its limit
	if (outline.title.length > PODCAST_EPISODE_TITLE_MAX_CHARS) {
		const titleLimitText = `over the ${PODCAST_EPISODE_TITLE_MAX_CHARS} allowed`
		throw new RejectedScriptError(`the title has ${outline.title.length} characters, ${titleLimitText}`)
	}
	if (outline.description.length > PODCAST_EPISODE_DESCRIPTION_MAX_CHARS) {
		const descriptionLimitText = `over the ${PODCAST_EPISODE_DESCRIPTION_MAX_CHARS} allowed`
		throw new RejectedScriptError(
			`the description has ${outline.description.length} characters, ${descriptionLimitText}`,
		)
	}

	// reject a planned Finding that was not an input, and a Finding planned twice
	const plannedFindingIds = outline.segments.flatMap((segment) => segment.chapters.map((chapter) => chapter.findingId))
	const unknownFindingId = plannedFindingIds.find((plannedFindingId) => !findingIds.includes(plannedFindingId))
	if (unknownFindingId) {
		throw new RejectedScriptError(`the outline plans a finding that was not in its input: ${unknownFindingId}`)
	}
	if (new Set(plannedFindingIds).size !== plannedFindingIds.length) {
		throw new RejectedScriptError("the outline plans a finding twice")
	}

	// reject a plan longer than a Podcast Episode may run
	const plannedMinutes = outline.segments
		.flatMap((segment) => segment.chapters)
		.reduce((sum, chapter) => sum + chapter.minutes, 0)
	if (plannedMinutes > MAX_PODCAST_EPISODE_MINUTES) {
		throw new RejectedScriptError(
			`the outline plans ${plannedMinutes} minutes, over the ${MAX_PODCAST_EPISODE_MINUTES} allowed`,
		)
	}
}

// repair the last outline draft. cut the title and the description, and leave out each unknown or repeated Finding.
// keep a plan past the minute limit, and throw a RejectedScriptError if no chapter is left
function toRepairedPodcastEpisodeOutline(outline: PodcastEpisodeOutline, findingIds: string[]): PodcastEpisodeOutline {
	// keep each chapter whose Finding was given and not already planned, then each segment with a chapter left
	const plannedFindingIds = new Set<string>()
	const plannedSegments = outline.segments.map((segment) => ({
		...segment,
		chapters: segment.chapters.filter((chapter) => {
			const isNewInputFinding = findingIds.includes(chapter.findingId) && !plannedFindingIds.has(chapter.findingId)
			plannedFindingIds.add(chapter.findingId)
			return isNewInputFinding
		}),
	}))
	const segments = plannedSegments.filter((segment) => segment.chapters.length > 0)
	if (segments.length === 0) {
		throw new RejectedScriptError("the outline plans no finding from its input")
	}

	// cut the title and the description to their limits
	return {
		title: toClippedText(outline.title, PODCAST_EPISODE_TITLE_MAX_CHARS),
		description: toClippedText(outline.description, PODCAST_EPISODE_DESCRIPTION_MAX_CHARS),
		segments,
	}
}

// a segment draft to check, the Findings that the outline gave it, and whether it opens or closes the Podcast Episode
type CheckPodcastEpisodeSegmentOptions = {
	segment: PodcastEpisodeSegment
	outlinedFindingIds: string[]
	isFirstSegment: boolean
	isLastSegment: boolean
}

// throw a RejectedScriptError if the chapters do not match the outlined Findings one for one, a chapter quotes too much,
// the first segment has no cold open, or the last has no sign-off, no goodbye, or a repeated goodbye opening turn
function checkPodcastEpisodeSegment({
	segment,
	outlinedFindingIds,
	isFirstSegment,
	isLastSegment,
}: CheckPodcastEpisodeSegmentOptions): void {
	// reject a chapter for a Finding that the outline did not give the segment
	const writtenFindingIds = segment.chapters.map((chapter) => chapter.findingId)
	const unknownFindingId = writtenFindingIds.find((writtenFindingId) => !outlinedFindingIds.includes(writtenFindingId))
	if (unknownFindingId) {
		throw new RejectedScriptError(`a chapter cites a finding that was not in its input: ${unknownFindingId}`)
	}

	// reject a segment without exactly one chapter for each outlined Finding
	const isEveryFindingWrittenOnce =
		writtenFindingIds.length === outlinedFindingIds.length &&
		new Set(writtenFindingIds).size === writtenFindingIds.length
	if (!isEveryFindingWrittenOnce) {
		throw new RejectedScriptError("the segment does not have one chapter for each of its findings")
	}

	// reject a chapter that quotes too much, with its quote count and its longest quote's word count
	const overQuotedChapter = segment.chapters.find((chapter) => !isQuotedWithinLimit(chapter.turns))
	if (overQuotedChapter) {
		const quoteWordCounts = toQuoteWordCounts(overQuotedChapter.turns)
		const quoteCountText = `quotes: ${quoteWordCounts.length}, longest quote: ${Math.max(...quoteWordCounts)} words`
		const quoteLimitText = `a chapter may have ${MAX_CHAPTER_QUOTES} quotes of up to ${MAX_QUOTE_WORDS} words`
		throw new RejectedScriptError(
			`the chapter "${overQuotedChapter.title}" quotes its source too much. ${quoteCountText}. ${quoteLimitText}`,
		)
	}

	// reject a first segment with no cold open
	if (isFirstSegment && !segment.coldOpen?.length) {
		throw new RejectedScriptError("the first segment has no cold open")
	}

	// reject a last segment with no sign-off or no goodbye
	if (isLastSegment && !segment.signOff?.length) {
		throw new RejectedScriptError("the last segment has no sign-off")
	}
	if (isLastSegment && !segment.goodbye?.length) {
		throw new RejectedScriptError("the last segment has no goodbye")
	}

	// reject a sign-off or a goodbye that repeats a goodbye opening turn
	const repeatedOpeningTurn = [...(segment.signOff ?? []), ...(segment.goodbye ?? [])].find(
		isRepeatedGoodbyeOpeningTurn,
	)
	if (repeatedOpeningTurn) {
		throw new RejectedScriptError(
			`the sign-off or the goodbye repeats "${repeatedOpeningTurn.text}", which the show adds itself`,
		)
	}
}

// repair the last segment draft. leave out each chapter of an unknown or repeated Finding, each chapter that quotes too
// much, and each sign-off or goodbye turn that repeats a goodbye opening turn
function toRepairedPodcastEpisodeSegment(
	segment: PodcastEpisodeSegment,
	outlinedFindingIds: string[],
): PodcastEpisodeSegment {
	// keep each chapter of a new outlined Finding, if the chapter stays within the quote limits
	const writtenFindingIds = new Set<string>()
	const chapters = segment.chapters.filter((chapter) => {
		const isNewOutlinedFinding =
			outlinedFindingIds.includes(chapter.findingId) && !writtenFindingIds.has(chapter.findingId)
		writtenFindingIds.add(chapter.findingId)
		return isNewOutlinedFinding && isQuotedWithinLimit(chapter.turns)
	})

	// return the segment with its kept chapters, even if no chapter is kept, and its other closing turns
	const signOff = segment.signOff?.filter((turn) => !isRepeatedGoodbyeOpeningTurn(turn))
	const goodbye = segment.goodbye?.filter((turn) => !isRepeatedGoodbyeOpeningTurn(turn))
	return { ...segment, chapters, signOff, goodbye }
}

// a text within the character limit. a longer text is cut at its last word boundary and ends in an ellipsis
function toClippedText(text: string, maxChars: number): string {
	// return a trimmed text that fits the limit
	const trimmedText = text.trim()
	if (trimmedText.length <= maxChars) {
		return trimmedText
	}

	// cut before the word that would run past the limit, leaving room for the ellipsis
	const clippedText = trimmedText.slice(0, maxChars - 1)
	const lastSpaceIndex = clippedText.lastIndexOf(" ")
	const wholeWordText = lastSpaceIndex > 0 ? clippedText.slice(0, lastSpaceIndex) : clippedText
	return `${wholeWordText.replace(/[\s.,;:!?–—-]+$/, "")}…`
}

// how long the turns run in minutes at the hosts' speaking rate. an inline tag such as <laugh> is not a word
function toTurnMinutes(turns: PodcastEpisodeTurn[]): number {
	const spokenText = turns.map((turn) => toTranscriptText(turn.text)).join(" ")
	return toWordCount(spokenText) / WORDS_PER_MINUTE
}

// whether the turns stay within a chapter's quote limits
function isQuotedWithinLimit(turns: PodcastEpisodeTurn[]): boolean {
	const quoteWordCounts = toQuoteWordCounts(turns)
	const isEveryQuoteShort = quoteWordCounts.every((wordCount) => wordCount <= MAX_QUOTE_WORDS)
	return quoteWordCounts.length <= MAX_CHAPTER_QUOTES && isEveryQuoteShort
}

// the word count of each quote in the turns
function toQuoteWordCounts(turns: PodcastEpisodeTurn[]): number[] {
	const quotedTextWordCounts = turns
		.flatMap((turn) => [...turn.text.matchAll(QUOTED_TEXT_PATTERN)])
		.map((quotedMatch) => toWordCount(quotedMatch[1] ?? ""))
	return quotedTextWordCounts.filter((wordCount) => wordCount >= MIN_QUOTE_WORDS)
}

// how many words a text has
function toWordCount(text: string): number {
	return text.split(/\s+/).filter(Boolean).length
}
