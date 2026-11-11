// what a Topic Post's discussion card reads: its copy, its line under the title, its transcript, and whether
// Regenerate shows
import type { PodcastEpisodeTranscriptTurn } from "@carlnotes/contracts/podcast"
import { TOPIC_POST_DISCUSSION_TITLE, type TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { toPodcastEpisodeDayAndDurationLabels, toPodcastEpisodeDurationLabel } from "./labels"
import { hasRegenerationLeft } from "./topicImageEditor"

// how often a page reads its post again while a discussion records
export const TOPIC_POST_DISCUSSION_POLL_MS = 15_000

// the discussion card's copy
export const TOPIC_POST_DISCUSSION_LABELS = {
	title: TOPIC_POST_DISCUSSION_TITLE,
	hosts: "Carl and Vienna discuss amongst themselves",
	recording: "Carl and Vienna are discussing.",
	recordingAgain: "Carl and Vienna are discussing it again.",
	notRecorded: "Not recorded yet.",
	regenerate: "Regenerate",
	regenerating: "Starting…",
	cancel: "Cancel",
	hintLabel: "Discussion prompt",
	regenerateError: "Carl couldn't start that recording. Try again in a moment.",
}

// the parts of a post its discussion card reads
type DiscussionTopicPost = Pick<TopicPostResponse, "discussion" | "discussionRegenerationQuota">

/**
 * Returns whether a post shows its discussion card: one with a recording or one on its way, and one whose reader may
 * record it.
 */
export function isTopicPostDiscussionShown(topicPost: DiscussionTopicPost): boolean {
	return topicPost.discussion !== null || topicPost.discussionRegenerationQuota !== null
}

/**
 * Returns the line under the discussion's title: its length beside who talks, that it is recording, or that it was
 * never recorded.
 */
export function toTopicPostDiscussionDetailsText({ discussion }: DiscussionTopicPost): string {
	// a post with no recording and none on its way
	if (!discussion) {
		return TOPIC_POST_DISCUSSION_LABELS.notRecorded
	}

	// a recording on its way, the first or a new one
	if (discussion.isRecording) {
		return discussion.id ? TOPIC_POST_DISCUSSION_LABELS.recordingAgain : TOPIC_POST_DISCUSSION_LABELS.recording
	}
	return `${toPodcastEpisodeDurationLabel(discussion.durationSeconds)} · ${TOPIC_POST_DISCUSSION_LABELS.hosts}`
}

/**
 * Returns the transcript that the discussion card opens: the turns of a recording that plays. Null while a recording
 * is on its way, and for a discussion with no recording or no turns.
 */
export function toTopicPostDiscussionTranscript({
	discussion,
}: DiscussionTopicPost): PodcastEpisodeTranscriptTurn[] | null {
	if (!discussion?.id || discussion.isRecording || !discussion.transcript?.length) {
		return null
	}
	return discussion.transcript
}

/**
 * Returns the line beside a recording's play button in the post's info popup: the day it was recorded, its length,
 * and who talks, such as Nov 4 · 3 min · Carl and Vienna discuss amongst themselves.
 */
export function toTopicPostDiscussionInfoText(
	discussion: Pick<NonNullable<TopicPostResponse["discussion"]>, "publishedAt" | "durationSeconds">,
): string {
	const dayAndDurationLabels = toPodcastEpisodeDayAndDurationLabels(discussion).filter(Boolean)
	return [...dayAndDurationLabels, TOPIC_POST_DISCUSSION_LABELS.hosts].join(" · ")
}

/**
 * Returns whether the reader may start a recording now: one who may publish on the post's Topic, with a regeneration
 * left this month, while none is recording.
 */
export function isDiscussionRegenerateShown(topicPost: DiscussionTopicPost): boolean {
	return hasRegenerationLeft(topicPost.discussionRegenerationQuota) && !topicPost.discussion?.isRecording
}
