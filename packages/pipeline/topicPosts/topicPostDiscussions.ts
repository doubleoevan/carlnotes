// a Topic Post Discussion's recording: the row that bills for it, the script written from the post and its shared
// Comments, the one speech call, the encode with no theme, and the write that publishes or fails the row

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TopicPostDiscussionKind } from "@carlnotes/contracts/enums"
import { db } from "@carlnotes/db"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { topicPostDiscussions, topicPosts } from "@carlnotes/db/schema/topicPosts"
import { users } from "@carlnotes/db/schema/users"
import { loadTopicPostSharedCommentTexts } from "@carlnotes/db/sharedComments"
import {
	deleteStoredObjects,
	recordPendingObjectDeletions,
	toTopicPostDiscussionAudioKey,
	uploadPodcastEpisodeFile,
} from "@carlnotes/db/store"
import { speechCost } from "@carlnotes/models/budget"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { recordSpeech, SPEECH_BYTES_PER_SECOND, WAV_HEADER_BYTES } from "@carlnotes/models/speech"
import { podcastEpisodeSpeechModel } from "@carlnotes/server/podcastEpisodeSettings"
import { and, eq, isNotNull, ne, sql } from "drizzle-orm"
import { joinChapterFiles, SpeechFailedError } from "../podcast/podcastEpisodeAudio"
import { isSharedCommentSpeakable, isUsernameSpeakable } from "../podcast/podcastEpisodeSharedComments"
import { startTopicPostDiscussionWorkflow } from "../temporalClient"
import { type DiscussionComment, MAX_DISCUSSION_COMMENTS, writeTopicPostDiscussion } from "./topicPostDiscussionScript"

// a discussion is one speech call on the standard tier
const DISCUSSION_SPEECH_TIER = "standard"

// a discussion that cannot be recorded, with whether its user's budget is why
export class TopicPostDiscussionError extends Error {
	constructor(
		message: string,
		readonly isBudgetSpent = false,
	) {
		super(message)
	}
}

// a new discussion: its Topic Post, the user it bills, why it runs, and the starter's note, which goes to the workflow
// and never to a row
export type StartTopicPostDiscussionOptions = {
	topicPostId: string
	userId: string
	kind: TopicPostDiscussionKind
	hint?: string
}

/**
 * Writes a recording row for a Topic Post's discussion and starts its workflow. Returns the discussion's id. A post
 * with a recording under way takes no second row, which the insert rejects as a duplicate key. A row whose workflow
 * did not start is deleted, and the start's error is thrown.
 */
export async function startTopicPostDiscussion({
	topicPostId,
	userId,
	kind,
	hint,
}: StartTopicPostDiscussionOptions): Promise<string> {
	// the row first, so the workflow finds it, then the workflow named by the row
	const [discussionRow] = await db
		.insert(topicPostDiscussions)
		.values({ topicPostId, userId, kind, model: podcastEpisodeSpeechModel() })
		.returning({ id: topicPostDiscussions.id })
	if (!discussionRow) {
		throw new Error(`no discussion row was written for topic post ${topicPostId}`)
	}

	// the workflow that records it. a row with no workflow would stay recording, so a failed start takes the row back
	try {
		await startTopicPostDiscussionWorkflow({ discussionId: discussionRow.id, hint })
	} catch (error) {
		await db.delete(topicPostDiscussions).where(eq(topicPostDiscussions.id, discussionRow.id))
		throw error
	}
	return discussionRow.id
}

/**
 * Starts a published Topic Post's first discussion, billed to its author. Returns the discussion's id, or null for a
 * post that is gone or unpublished and for one that already has a discussion.
 */
export async function startTopicPostPublishDiscussion(topicPostId: string): Promise<string | null> {
	// the published post's author, and whether any discussion of it was ever started
	const [[topicPostRow], [discussionRow]] = await Promise.all([
		db
			.select({ authorUserId: topicPosts.authorUserId })
			.from(topicPosts)
			.where(and(eq(topicPosts.id, topicPostId), isNotNull(topicPosts.publishedAt)))
			.limit(1),
		db
			.select({ id: topicPostDiscussions.id })
			.from(topicPostDiscussions)
			.where(eq(topicPostDiscussions.topicPostId, topicPostId))
			.limit(1),
	])
	if (!topicPostRow || discussionRow) {
		return null
	}
	return startTopicPostDiscussion({ topicPostId, userId: topicPostRow.authorUserId, kind: "publish" })
}

/**
 * Writes a recording discussion's script on its user's key, from the post's text and its shared Comments, and saves
 * it on the row. A Comment whose text or username is flagged is left out, and a flagged author is called the author.
 * Throws a TopicPostDiscussionError for a post that is gone and for a spent budget.
 */
export async function writeTopicPostDiscussionScript(discussionId: string, hint?: string): Promise<void> {
	// the recording row with its post's words and its author's name. a row that already has a script is done
	const [discussion] = await db
		.select({
			userId: topicPostDiscussions.userId,
			status: topicPostDiscussions.status,
			script: topicPostDiscussions.script,
			topicPostId: topicPosts.id,
			title: topicPosts.title,
			html: topicPosts.html,
			publishedAt: topicPosts.publishedAt,
			authorUsername: users.username,
		})
		.from(topicPostDiscussions)
		.innerJoin(topicPosts, eq(topicPosts.id, topicPostDiscussions.topicPostId))
		.innerJoin(users, eq(users.id, topicPosts.authorUserId))
		.where(eq(topicPostDiscussions.id, discussionId))
	if (!discussion?.publishedAt || !discussion.userId || discussion.status !== "recording") {
		throw new TopicPostDiscussionError(`discussion ${discussionId} has no published post to record`)
	}

	// a script already written, on a retried activity, is kept
	if (discussion.script) {
		return
	}

	// the plan's podcast cutoff stops a recording as it stops a Podcast Episode
	if (await isMonthlyBudgetCutoffPassed(discussion.userId, "podcastEpisodes")) {
		throw new TopicPostDiscussionError("the user's podcast budget is spent for this month", true)
	}

	// the shared Comments the hosts may read, and the author's name if it may be said aloud
	const [comments, isAuthorSpeakable] = await Promise.all([
		loadSpeakableComments(discussion.topicPostId),
		isUsernameSpeakable(discussion.authorUsername),
	])

	// write the script on the user's key, and keep it with what it cost
	const { turns, costDollars } = await writeTopicPostDiscussion({
		title: discussion.title,
		html: discussion.html,
		authorUsername: isAuthorSpeakable ? discussion.authorUsername : null,
		comments,
		hint,
		litellmApiKey: await loadOrProvisionUserLiteLLMKey(discussion.userId),
	})
	await db
		.update(topicPostDiscussions)
		.set({ script: turns, cost: sql`${topicPostDiscussions.cost} + ${costDollars}` })
		.where(eq(topicPostDiscussions.id, discussionId))
}

// the post's shared Comments that pass the screen, each with its commenter's username. a Comment by a closed account
// has no name to credit and is left out
async function loadSpeakableComments(topicPostId: string): Promise<DiscussionComment[]> {
	const sharedComments = await loadTopicPostSharedCommentTexts(topicPostId, MAX_DISCUSSION_COMMENTS)
	const speakableComments = await Promise.all(
		sharedComments.map(async ({ username, body }) =>
			username && (await isSharedCommentSpeakable({ username, body, commentId: "", findingId: null }))
				? [{ username, body }]
				: [],
		),
	)
	return speakableComments.flat()
}

/**
 * Records a discussion's script as one speech call on its user's key, encodes it with no theme, stores the audio under
 * its Topic Post, and publishes the row. The audio of the post's earlier discussions is scheduled for deletion. Throws
 * a SpeechFailedError if the call recorded no audio.
 */
export async function recordTopicPostDiscussionAudio(discussionId: string): Promise<void> {
	// the recording row with its script. a published row, on a retried activity, has nothing left to do
	const [discussion] = await db.select().from(topicPostDiscussions).where(eq(topicPostDiscussions.id, discussionId))
	if (!discussion || discussion.status === "published") {
		return
	}
	if (!discussion.script || !discussion.userId) {
		throw new SpeechFailedError(`discussion ${discussionId} has no script to record`, false)
	}

	// record the speech on the user's key. only a retryable failure is worth another attempt
	const recordSpeechResult = await recordSpeech({
		turns: discussion.script,
		speechTier: DISCUSSION_SPEECH_TIER,
		litellmApiKey: await loadOrProvisionUserLiteLLMKey(discussion.userId),
	})
	if (recordSpeechResult.outcome !== "recorded") {
		const isRetryable = recordSpeechResult.outcome === "retryable"
		throw new SpeechFailedError(`the speech call failed: ${recordSpeechResult.reason}`, isRetryable)
	}

	// record what the call cost before the audio is stored, so a failed upload still counts the paid call
	const { inputTokens, audioTokens, audioBytes } = recordSpeechResult
	const speechDollars = speechCost({ speechTier: DISCUSSION_SPEECH_TIER, inputTokens, audioTokens })
	await db
		.update(topicPostDiscussions)
		.set({ cost: sql`${topicPostDiscussions.cost} + ${speechDollars}` })
		.where(eq(topicPostDiscussions.id, discussionId))

	// encode the talk alone to one normalized MP3 on temporary files, and store it under the post
	const audioKey = toTopicPostDiscussionAudioKey(discussion.topicPostId, discussionId)
	const audioByteSize = await encodeAndStoreDiscussion(audioBytes, audioKey)
	const durationSeconds = Math.round(Math.max(0, audioBytes.byteLength - WAV_HEADER_BYTES) / SPEECH_BYTES_PER_SECOND)

	// publish the row, and let the audio of the post's earlier discussions go
	const isPublished = await publishTopicPostDiscussion({
		discussionId,
		topicPostId: discussion.topicPostId,
		audioKey,
		audioByteSize,
		durationSeconds,
	})

	// a post deleted during the recording took the row with it, so its audio has nothing to belong to
	if (!isPublished) {
		await deleteStoredObjects([audioKey])
	}
}

// write the speech to a temporary WAV, join it with the theme mix off, upload the MP3, and return its byte size
async function encodeAndStoreDiscussion(wavBytes: Uint8Array, audioKey: string): Promise<number> {
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "discussion-"))
	try {
		// the one recording is the join's one chapter
		const wavPath = join(temporaryDirectory, "0.wav")
		const audioPath = join(temporaryDirectory, "audio.mp3")
		await Bun.write(wavPath, wavBytes)
		await joinChapterFiles({
			temporaryDirectory,
			chapterPaths: [wavPath],
			audioPath,
			themeClips: { intro: null, outro: null },
			speechSeconds: 0,
			hasThemeMix: false,
		})

		// store the finished file
		await uploadPodcastEpisodeFile({ key: audioKey, filePath: audioPath, contentType: "audio/mpeg" })
		return Bun.file(audioPath).size
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true })
	}
}

// the stored audio of a discussion to publish: its row, its post, its key, its byte size, and its length
type PublishTopicPostDiscussionOptions = {
	discussionId: string
	topicPostId: string
	audioKey: string
	audioByteSize: number
	durationSeconds: number
}

// publish the row, and schedule the audio of the post's earlier published discussions for deletion. returns whether
// the row was still there to publish
async function publishTopicPostDiscussion({
	discussionId,
	topicPostId,
	audioKey,
	audioByteSize,
	durationSeconds,
}: PublishTopicPostDiscussionOptions): Promise<boolean> {
	return db.transaction(async (transaction) => {
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
}

/**
 * Closes a recording discussion as failed with its reason. A row that already published, or is gone, stays as it is.
 */
export async function failTopicPostDiscussion(discussionId: string, reason: string): Promise<void> {
	await db
		.update(topicPostDiscussions)
		.set({ status: "failed", error: reason })
		.where(and(eq(topicPostDiscussions.id, discussionId), eq(topicPostDiscussions.status, "recording")))
}
