// a Topic Post Discussion's audio: the one speech call, whose audio is stored before the encode, the encode with no
// theme, and the write that publishes the row

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { topicPostDiscussions } from "@carlnotes/db/schema/topicPosts"
import { clearStatusReads } from "@carlnotes/db/statusReadCaches"
import {
	deleteStoredObjects,
	downloadPodcastEpisodeFile,
	loadStoredObjectByteSize,
	recordPendingObjectDeletions,
	toTopicPostDiscussionAudioKey,
	toTopicPostDiscussionSpeechKey,
	uploadAttachment,
	uploadPodcastEpisodeFile,
} from "@carlnotes/db/store"
import { clearVisitorTopicPostPages } from "@carlnotes/db/visitorPageCaches"
import { speechCost } from "@carlnotes/models/budget"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { recordSpeech, SPEECH_BYTES_PER_SECOND, WAV_HEADER_BYTES } from "@carlnotes/models/speech"
import { and, eq, isNotNull, ne, sql } from "drizzle-orm"
import { joinChapterFiles, SpeechFailedError } from "../podcast/podcastEpisodeAudio"

// a discussion is one speech call on the standard tier
const DISCUSSION_SPEECH_TIER = "standard"

// how long a discussion's stored speech stays if nothing deletes it first, which outlasts every attempt of a recording
const STORED_SPEECH_LIFETIME_MS = 2 * DAY_MS

/**
 * Records a discussion's script as one speech call on its user's key, stores the speech, encodes it with no theme,
 * stores the audio under its Topic Post, and publishes the row. Speech that an earlier attempt stored is encoded as it
 * is, with no speech call and no cost. The audio of the Topic Post's earlier discussions is scheduled for deletion.
 * Throws a SpeechFailedError if the call recorded no audio.
 */
export async function recordTopicPostDiscussionAudio(discussionId: string, signal?: AbortSignal): Promise<void> {
	// the recording row with its script. a published row, on a retried activity, has nothing left to do
	const [discussion] = await db.select().from(topicPostDiscussions).where(eq(topicPostDiscussions.id, discussionId))
	if (!discussion || discussion.status === "published") {
		return
	}
	if (!discussion.script || !discussion.userId) {
		throw new SpeechFailedError(`discussion ${discussionId} has no script to record`, false)
	}

	// speech that an earlier attempt stored is the recording, so a retry pays for no second speech call
	const speechKey = toTopicPostDiscussionSpeechKey(discussion.topicPostId, discussionId)
	const storedSpeechByteSize = await loadStoredObjectByteSize(speechKey)
	const speechBytes =
		storedSpeechByteSize === null
			? await recordDiscussionSpeech({ discussionId, userId: discussion.userId, script: discussion.script, speechKey })
			: null

	// encode the talk alone to one normalized MP3 on temporary files, and store it under the Topic Post
	const audioKey = toTopicPostDiscussionAudioKey(discussion.topicPostId, discussionId)
	const audioByteSize = await encodeAndStoreDiscussion({ speechBytes, speechKey, audioKey, signal })
	const speechByteSize = speechBytes?.byteLength ?? storedSpeechByteSize ?? 0
	const durationSeconds = Math.round(Math.max(0, speechByteSize - WAV_HEADER_BYTES) / SPEECH_BYTES_PER_SECOND)

	// publish the row, and let the audio of the Topic Post's earlier discussions go with the visitor page that plays it
	const isPublished = await publishTopicPostDiscussion({
		discussionId,
		topicPostId: discussion.topicPostId,
		audioKey,
		audioByteSize,
		durationSeconds,
	})
	if (isPublished) {
		await clearVisitorTopicPostPages(discussion.topicPostId)
	}

	// the stored speech has done its work. a Topic Post deleted during the recording took the row with it, so its
	// audio has nothing to belong to either. a row that an overlapping attempt published plays the audio under the
	// same key, so that audio stays
	const isAudioPublished = isPublished || (await isDiscussionAudioPublished(discussionId, audioKey))
	await deleteStoredObjects(isAudioPublished ? [speechKey] : [speechKey, audioKey])
}

// whether the discussion's row plays the audio under the key
async function isDiscussionAudioPublished(discussionId: string, audioKey: string): Promise<boolean> {
	const [discussion] = await db
		.select({ audioKey: topicPostDiscussions.audioKey })
		.from(topicPostDiscussions)
		.where(eq(topicPostDiscussions.id, discussionId))
	return discussion?.audioKey === audioKey
}

// one discussion's speech call: its row, the user it bills, its script, and the key its speech is stored under
type RecordDiscussionSpeechOptions = {
	discussionId: string
	userId: string
	script: NonNullable<typeof topicPostDiscussions.$inferSelect.script>
	speechKey: string
}

// record the script as one speech call on the user's key, add its cost to the row, and store the speech before any
// later step can fail. returns the speech
async function recordDiscussionSpeech({
	discussionId,
	userId,
	script,
	speechKey,
}: RecordDiscussionSpeechOptions): Promise<Uint8Array> {
	// record the speech on the user's key. only a retryable failure is worth another attempt
	const recordSpeechResult = await recordSpeech({
		turns: script,
		speechTier: DISCUSSION_SPEECH_TIER,
		litellmApiKey: await loadOrProvisionUserLiteLLMKey(userId),
	})
	if (recordSpeechResult.outcome !== "recorded") {
		const isRetryable = recordSpeechResult.outcome === "retryable"
		throw new SpeechFailedError(`the speech call failed: ${recordSpeechResult.reason}`, isRetryable)
	}

	// record what the call cost before the speech is stored, so a failed upload still counts the paid call
	const { inputTokens, audioTokens, audioBytes } = recordSpeechResult
	const speechDollars = speechCost({ speechTier: DISCUSSION_SPEECH_TIER, inputTokens, audioTokens })
	await db
		.update(topicPostDiscussions)
		.set({ cost: sql`${topicPostDiscussions.cost} + ${speechDollars}` })
		.where(eq(topicPostDiscussions.id, discussionId))

	// store the speech with a pending deletion recorded first, so speech that nothing deletes still goes in time
	const nextTryAt = new Date(Date.now() + STORED_SPEECH_LIFETIME_MS)
	await recordPendingObjectDeletions({ handle: db, objectKeys: [speechKey], nextTryAt })
	await uploadAttachment(speechKey, audioBytes, "audio/wav")
	return audioBytes
}

// one encode: the speech if this attempt recorded it, the key it is stored under, the key the MP3 is stored under, and
// a signal that stops the encode once it aborts
type EncodeAndStoreDiscussionOptions = {
	speechBytes: Uint8Array | null
	speechKey: string
	audioKey: string
	signal?: AbortSignal
}

// write the speech to a temporary WAV, from this attempt's call or from storage, join it with the theme mix off,
// upload the MP3, and return its byte size. an aborted signal stops the download, the join, and the upload
async function encodeAndStoreDiscussion({
	speechBytes,
	speechKey,
	audioKey,
	signal,
}: EncodeAndStoreDiscussionOptions): Promise<number> {
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "discussion-"))
	try {
		// the one recording is the join's one chapter, written from this attempt's speech or read from storage
		const wavPath = join(temporaryDirectory, "0.wav")
		const audioPath = join(temporaryDirectory, "audio.mp3")
		if (speechBytes) {
			await Bun.write(wavPath, speechBytes)
		} else {
			await downloadPodcastEpisodeFile({ key: speechKey, filePath: wavPath, signal })
		}

		// join the talk alone, with the theme mix off
		await joinChapterFiles({
			temporaryDirectory,
			chapterPaths: [wavPath],
			audioPath,
			themeClips: { intro: null, outro: null },
			speechSeconds: 0,
			hasThemeMix: false,
			signal,
		})

		// store the finished file
		await uploadPodcastEpisodeFile({ key: audioKey, filePath: audioPath, contentType: "audio/mpeg", signal })
		return Bun.file(audioPath).size
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true })
	}
}

// the stored audio of a discussion to publish: its row, its Topic Post, its key, its byte size, and its length
type PublishTopicPostDiscussionOptions = {
	discussionId: string
	topicPostId: string
	audioKey: string
	audioByteSize: number
	durationSeconds: number
}

// publish the row, and schedule the audio of the Topic Post's earlier published discussions for deletion. returns
// whether the row was still there to publish
async function publishTopicPostDiscussion({
	discussionId,
	topicPostId,
	audioKey,
	audioByteSize,
	durationSeconds,
}: PublishTopicPostDiscussionOptions): Promise<boolean> {
	const isPublished = await db.transaction(async (transaction) => {
		// the row publishes only while it is still recording
		const publishedRows = await transaction
			.update(topicPostDiscussions)
			.set({ status: "published", audioKey, audioByteSize, durationSeconds, publishedAt: new Date() })
			.where(and(eq(topicPostDiscussions.id, discussionId), eq(topicPostDiscussions.status, "recording")))
			.returning({ id: topicPostDiscussions.id })
		if (publishedRows.length === 0) {
			return false
		}

		// the earlier discussions keep their rows, which the month's spend sums, and lose their audio
		const replacedRows = await transaction
			.update(topicPostDiscussions)
			.set({ audioKey: null, audioByteSize: null })
			.where(
				and(
					eq(topicPostDiscussions.topicPostId, topicPostId),
					ne(topicPostDiscussions.id, discussionId),
					isNotNull(topicPostDiscussions.audioKey),
				),
			)
			.returning({ id: topicPostDiscussions.id })
		await recordPendingObjectDeletions({
			handle: transaction,
			objectKeys: replacedRows.map((replacedRow) => toTopicPostDiscussionAudioKey(topicPostId, replacedRow.id)),
			nextTryAt: new Date(),
		})
		return true
	})

	// the post's discussion status copy goes, so a poll reads it published
	if (isPublished) {
		await clearStatusReads("topicPostDiscussion", topicPostId)
	}
	return isPublished
}
