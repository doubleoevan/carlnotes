// a Podcast Episode's outline. its shape and limits, the checks on an earlier outline draft, and the repairs of a last
// outline draft
import { PODCAST_EPISODE_DESCRIPTION_MAX_CHARS, PODCAST_EPISODE_TITLE_MAX_CHARS } from "@shared/contracts"
import { z } from "zod"
import { RejectedScriptError, toClippedText } from "./podcastEpisodeScript"

// the most minutes that an outline may plan for one chapter, and the fewest.
// a chapter and the turns recorded with it fit one speech request of about eleven minutes. a script may run long
const MAX_PLANNED_CHAPTER_MINUTES = 8
const MIN_PLANNED_CHAPTER_MINUTES = 1

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

// an outline draft to check, the ids of the Findings that its prompt listed, the most minutes that it may plan,
// and whether it is the call's last draft
export type ToCheckedPodcastEpisodeOutlineOptions = {
	outline: PodcastEpisodeOutline
	findingIds: string[]
	maxMinutes: number
	isLastScriptDraft?: boolean
}

/**
 * Returns the checked outline, or the repaired last draft, and throws a RejectedScriptError if the draft fails.
 */
export function toCheckedPodcastEpisodeOutline({
	outline,
	findingIds,
	maxMinutes,
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
	checkPodcastEpisodeOutline({ outline: limitedOutline, findingIds, maxMinutes })
	return limitedOutline
}

// throw a RejectedScriptError if the title or the description is too long, a Finding is unknown or planned twice,
// or the plan runs longer than the Podcast Episode may run
function checkPodcastEpisodeOutline({
	outline,
	findingIds,
	maxMinutes,
}: Omit<ToCheckedPodcastEpisodeOutlineOptions, "isLastScriptDraft">): void {
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
	if (plannedMinutes > maxMinutes) {
		throw new RejectedScriptError(`the outline plans ${plannedMinutes} minutes, over the ${maxMinutes} allowed`)
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
