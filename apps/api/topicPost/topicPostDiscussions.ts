// what the api reads of a Topic Post's discussions: the newest recording with audio, and whether one is recording

import type { PodcastEpisodeTurn } from "@carlnotes/contracts/payloads"
import { toTranscriptTurn } from "@carlnotes/contracts/podcastEpisodes"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { db } from "@carlnotes/db"
import { topicPostDiscussions } from "@carlnotes/db/schema/topicPosts"
import { and, desc, eq, isNotNull } from "drizzle-orm"

// the newest recording of a post that still has its audio, with the script it was recorded from
type TopicPostDiscussionAudioRow = {
	id: string
	durationSeconds: number | null
	publishedAt: Date | null
	audioKey: string | null
	audioByteSize: number | null
	script: PodcastEpisodeTurn[] | null
}

/**
 * Returns the newest recording of a Topic Post that still has its audio, or undefined for a post with none.
 */
export async function loadTopicPostDiscussionAudioRow(
	topicPostId: string,
): Promise<TopicPostDiscussionAudioRow | undefined> {
	const [discussionRow] = await db
		.select({
			id: topicPostDiscussions.id,
			durationSeconds: topicPostDiscussions.durationSeconds,
			publishedAt: topicPostDiscussions.publishedAt,
			audioKey: topicPostDiscussions.audioKey,
			audioByteSize: topicPostDiscussions.audioByteSize,
			script: topicPostDiscussions.script,
		})
		.from(topicPostDiscussions)
		.where(and(eq(topicPostDiscussions.topicPostId, topicPostId), isNotNull(topicPostDiscussions.audioKey)))
		.orderBy(desc(topicPostDiscussions.publishedAt))
		.limit(1)
	return discussionRow
}

/**
 * Returns a Topic Post's discussion as its page reads it: the newest published recording's id, length, time, and
 * transcript, and whether a newer one is recording. Null for a post with neither.
 */
export async function loadTopicPostDiscussion(topicPostId: string): Promise<TopicPostResponse["discussion"]> {
	// the newest recording that still has its audio, and whether one is on its way
	const [discussionAudioRow, [recordingRow]] = await Promise.all([
		loadTopicPostDiscussionAudioRow(topicPostId),
		db
			.select({ id: topicPostDiscussions.id })
			.from(topicPostDiscussions)
			.where(and(eq(topicPostDiscussions.topicPostId, topicPostId), eq(topicPostDiscussions.status, "recording")))
			.limit(1),
	])
	if (!discussionAudioRow && !recordingRow) {
		return null
	}
	return {
		id: discussionAudioRow?.id ?? null,
		durationSeconds: discussionAudioRow?.durationSeconds ?? null,
		publishedAt: discussionAudioRow?.publishedAt?.toISOString() ?? null,
		isRecording: Boolean(recordingRow),
		// the recording's script as a transcript reads it, with each speaker's name and no vocal tags
		transcript: discussionAudioRow?.script?.map(toTranscriptTurn),
	}
}
