// the shared Comments a Podcast Episode reads: the ones it takes by reactions, the classification each one passes
// before it can reach the speech model, and where each one goes in the script
import { SHARED_COMMENT_SLOTS } from "@carlnotes/contracts/social"
import {
	loadAiredSharedComments,
	loadWaitingSharedComments,
	markSharedCommentsAired,
	type PodcastSharedComment,
	releasePodcastEpisodeSharedComments,
} from "@carlnotes/db/sharedComments"
import { classifyUserText, type ModerationClassification } from "@carlnotes/models/moderation"
import { reportError } from "@carlnotes/server/monitoring"
import type { PodcastEpisodeOutline } from "./podcastEpisodeOutline"

// the Podcast Episode, its Topic, and whether it is short, which sets how many shared Comments it takes
type ClaimPodcastEpisodeSharedCommentsOptions = { topicId: string; podcastEpisodeId: string; isShort: boolean }

// where a segment's shared Comments go: in the chapters of their Findings, or in the closing turns before the sign-off
export type SharedCommentPlacements = {
	chapterSharedComments: PodcastSharedComment[]
	closingSharedComments: PodcastSharedComment[]
}

/**
 * Takes the Topic's waiting shared Comments for a Podcast Episode, most reactions first, up to its shared comment
 * slots. A Comment that fails the classification is skipped and stays waiting, and the next one takes its place. A
 * second call for the same Podcast Episode returns the same Comments, so a retried script reads what the first try
 * read.
 */
export async function claimPodcastEpisodeSharedComments({
	topicId,
	podcastEpisodeId,
	isShort,
}: ClaimPodcastEpisodeSharedCommentsOptions): Promise<PodcastSharedComment[]> {
	const airedSharedComments = await loadAiredSharedComments(podcastEpisodeId)
	if (airedSharedComments.length > 0) {
		return airedSharedComments
	}

	// classify one shared Comment at a time, so a Podcast Episode with its shared comment slots taken pays for no extra
	// classification
	const slotCount = isShort ? SHARED_COMMENT_SLOTS.short : SHARED_COMMENT_SLOTS.full
	const commentIds: string[] = []
	for (const sharedComment of await loadWaitingSharedComments(topicId)) {
		if (commentIds.length < slotCount && (await isSharedCommentSpeakable(sharedComment))) {
			commentIds.push(sharedComment.commentId)
		}
	}

	// take them, which frees their shared comment slots
	await markSharedCommentsAired({ commentIds, podcastEpisodeId })
	return loadAiredSharedComments(podcastEpisodeId)
}

/**
 * Gives back the shared Comments whose authors a finished script never names, which a repaired last draft can leave
 * out, so each one waits for the next Podcast Episode.
 */
export async function releaseUncreditedSharedComments(podcastEpisodeId: string, spokenText: string): Promise<void> {
	const lowerSpokenText = spokenText.toLowerCase()
	const uncreditedCommentIds = (await loadAiredSharedComments(podcastEpisodeId)).flatMap(({ commentId, username }) =>
		username && !lowerSpokenText.includes(username.toLowerCase()) ? [commentId] : [],
	)
	if (uncreditedCommentIds.length > 0) {
		await releasePodcastEpisodeSharedComments(podcastEpisodeId, uncreditedCommentIds)
	}
}

/**
 * Classifies a shared Comment's text and its author's username before a host says them aloud. A failed classification
 * counts as flagged, and it never stops the Podcast Episode.
 */
export async function isSharedCommentSpeakable({ username, body }: PodcastSharedComment): Promise<boolean> {
	// the username is read aloud too
	const classifications = await Promise.all([
		classifyUserText({ text: body, textKind: "a public comment on an article, a podcast episode, or a topic" }),
		...(username ? [classifyUserText({ text: username, textKind: "a username" })] : []),
	])
	return classifications.every(isSpeakableClassification)
}

// whether a classification lets the text through. a stack with no moderation proxy skips the classification
function isSpeakableClassification(classification: ModerationClassification): boolean {
	if (classification.outcome === "failed") {
		reportError(classification.error, "podcast-episode", { step: "shared comment screen" })
	}

	// a failed classification fails closed
	return (
		classification.outcome === "skipped" ||
		(classification.outcome === "classified" && !classification.verdict.isViolation)
	)
}

/**
 * Places the shared Comments for one segment. A Comment on a Finding this segment narrates goes in that chapter. Any
 * other Comment no chapter of the Podcast Episode can hold goes in the last segment's closing turns.
 */
export function toSharedCommentPlacements({
	sharedComments,
	outline,
	segmentIndex,
}: {
	sharedComments: PodcastSharedComment[]
	outline: PodcastEpisodeOutline
	segmentIndex: number
}): SharedCommentPlacements {
	// the Findings of this segment, and of the whole Podcast Episode
	const toFindingIds = (segments: PodcastEpisodeOutline["segments"]): Set<string> =>
		new Set(segments.flatMap((segment) => segment.chapters.map((chapter) => chapter.findingId)))
	const segmentFindingIds = toFindingIds(outline.segments.slice(segmentIndex, segmentIndex + 1))
	const narratedFindingIds = toFindingIds(outline.segments)

	// a Comment goes in one place, so the hosts talk about it once
	const isLastSegment = segmentIndex === outline.segments.length - 1
	return {
		chapterSharedComments: sharedComments.filter(
			({ findingId }) => findingId !== null && segmentFindingIds.has(findingId),
		),
		closingSharedComments: isLastSegment
			? sharedComments.filter(({ findingId }) => findingId === null || !narratedFindingIds.has(findingId))
			: [],
	}
}
