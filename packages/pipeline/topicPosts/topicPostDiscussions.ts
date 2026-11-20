// a Topic Post Discussion's recording: the row that bills for it, the script written from the post and its shared
// Comments, and the write that fails the row

import type { TopicPostDiscussionKind } from "@carlnotes/contracts/enums"
import { toHtmlText } from "@carlnotes/contracts/text"
import { db } from "@carlnotes/db"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import { topicPostDiscussions, topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { loadTopicPostSharedCommentTexts } from "@carlnotes/db/sharedComments"
import { deleteStoredObjects, toTopicPostDiscussionSpeechKey } from "@carlnotes/db/store"
import { EMBED_COST_PER_MILLION_TOKENS, toEstimatedTokens, tokenCost } from "@carlnotes/models/budget"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { embedVector } from "@carlnotes/models/models"
import { reportError } from "@carlnotes/server/monitoring"
import { podcastEpisodeSpeechModel } from "@carlnotes/server/podcastEpisodeSettings"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { isSharedCommentSpeakable, isUsernameSpeakable } from "../podcast/podcastEpisodeSharedComments"
import { startTopicPostDiscussionWorkflow } from "../temporalClient"
import { loadTopicMemoryPrompt } from "../topicMemoryPrompt"
import { type DiscussionComment, MAX_DISCUSSION_COMMENTS, writeTopicPostDiscussion } from "./topicPostDiscussionScript"

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
			topicId: topicPosts.topicId,
			hasPublicTopicMemories: sql<boolean>`exists (select 1 from ${topicMemories}
				inner join ${topics} on ${topics.id} = ${topicMemories.topicId}
				where ${topicMemories.topicId} = ${topicPosts.topicId}
				and ${topicMemories.status} = 'active' and ${topics.visibility} = 'public')`,
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

	// embed a bounded excerpt only when the public Topic has topic memories
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(discussion.userId)
	let topicMemoryPrompt = ""
	if (discussion.hasPublicTopicMemories) {
		const text = `${discussion.title}\n${toHtmlText(discussion.html)}`.slice(0, 4000)
		const embedding = await embedVector(text, { litellmApiKey, maxRetries: 0 })
		const cost = tokenCost(toEstimatedTokens(text.length), EMBED_COST_PER_MILLION_TOKENS)
		// charge the discussion for the relevance embedding before using it
		await db
			.update(topicPostDiscussions)
			.set({ cost: sql`${topicPostDiscussions.cost} + ${cost}` })
			.where(eq(topicPostDiscussions.id, discussionId))
		topicMemoryPrompt = await loadTopicMemoryPrompt({
			topicId: discussion.topicId,
			embeddings: [embedding],
			isPublicOnly: true,
		})
	}

	// write the script on the user's key, and keep it with what it cost
	const { turns, costDollars } = await writeTopicPostDiscussion({
		title: discussion.title,
		html: discussion.html,
		authorUsername: isAuthorSpeakable ? discussion.authorUsername : null,
		comments,
		hint,
		litellmApiKey,
		topicMemoryPrompt,
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
 * Closes a recording discussion as failed with its reason, reports it, and deletes the speech that an attempt stored.
 * A row that already published, or is gone, stays as it is.
 */
export async function failTopicPostDiscussion(discussionId: string, reason: string): Promise<void> {
	// the row closes only while it is still recording
	const [failedRow] = await db
		.update(topicPostDiscussions)
		.set({ status: "failed", error: reason })
		.where(and(eq(topicPostDiscussions.id, discussionId), eq(topicPostDiscussions.status, "recording")))
		.returning({ topicPostId: topicPostDiscussions.topicPostId })
	if (!failedRow) {
		return
	}

	// the post keeps its earlier discussion and nobody is told, so the failure is reported
	reportError(new Error("a topic post discussion failed to record"), "podcast-episode", {
		discussionId,
		reason: reason.slice(0, 200),
	})

	// a failed recording is never encoded, so its stored speech goes
	await deleteStoredObjects([toTopicPostDiscussionSpeechKey(failedRow.topicPostId, discussionId)])
}
