// what the Topic Post tools give their MCP views beside the structured result the model reads: a Topic's header with
// one page of its Topic Posts, and one Topic Post as its page shows it, with its comment thread and its discussion

import type { McpViewData } from "@carlnotes/contracts/mcpViews"
import {
	type TopicPostCard,
	toTopicPostDiscussionAudioPath,
	toTopicPostDiscussionPodcastEpisode,
} from "@carlnotes/contracts/topicPosts"
import type { topics } from "@carlnotes/db/schema/topics"
import { appUrl } from "@carlnotes/server/appUrl"
import { toPlayToken } from "../podcast/playTokens"
import { type TopicPostRow, toTopicPostResponse } from "../topicPost/topicPosts"
import { loadMcpViewSession, loadMcpViewTopic, toMcpViewPodcastEpisode } from "./mcpViewData"
import { loadToolCommentPage } from "./socialTools"
import { type ToolCaller, toToolCallerUserId } from "./toolCaller"

/**
 * Loads the topic posts MCP view's data: the caller, the topic the cards sit under, and one page of its Topic Posts.
 */
export async function loadTopicPostsMcpViewData(
	toolCaller: ToolCaller,
	{ topic, topicPosts }: { topic: typeof topics.$inferSelect; topicPosts: TopicPostCard[] },
): Promise<McpViewData> {
	const [session, mcpViewTopic] = await Promise.all([
		loadMcpViewSession(toolCaller),
		loadMcpViewTopic(toolCaller, topic),
	])
	return { session, podcastEpisodes: [], topic: mcpViewTopic, topicPosts }
}

/**
 * Loads the topic post MCP view's data: the caller, the Topic Post as its page shows it with the first page of its
 * comment thread as a tool reads it, and its discussion in the player's shape with a play token on its audio.
 */
export async function loadTopicPostMcpViewData(
	toolCaller: ToolCaller,
	topicPostRow: TopicPostRow,
): Promise<McpViewData> {
	// the post as the caller reads it, and its thread as a user who shares nothing
	const userId = toToolCallerUserId(toolCaller)
	const { topicPost, topic } = topicPostRow
	const [session, topicPostResponse, commentThread] = await Promise.all([
		loadMcpViewSession(toolCaller),
		toTopicPostResponse(userId, topicPostRow),
		loadToolCommentPage({ userId, topic, target: { kind: "post", id: topicPost.id } }),
	])

	// an MCP view starts no recording, so the post has no regeneration quota
	const mcpViewTopicPost = { ...topicPostResponse, commentThread, discussionRegenerationQuota: null }

	// the discussion plays from the audio route's absolute url, with the caller's play token in place of a session
	const discussionPodcastEpisode = toTopicPostDiscussionPodcastEpisode(mcpViewTopicPost)
	const playToken = toPlayToken({ topicPostId: topicPost.id, userId })
	const audioUrl = `${appUrl()}${toTopicPostDiscussionAudioPath(topicPost.id)}?play=${playToken}`
	return {
		session,
		podcastEpisodes: discussionPodcastEpisode ? [toMcpViewPodcastEpisode(discussionPodcastEpisode, audioUrl)] : [],
		topicPost: mcpViewTopicPost,
	}
}
