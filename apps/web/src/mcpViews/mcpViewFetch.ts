// the fetch an MCP view runs with. the MCP view's security policy names no connections, so the api requests the site's
// components make are returned here. a podcast episode the player loads comes from the tool result, a finding's
// feedback, a comment thread's read, a Comment's post, a reaction's save, and a Topic Post's read go to their tools,
// and every other request fails
import type { McpViewData } from "@carlnotes/contracts/mcpViews"
import { findingFeedbackPayload } from "@carlnotes/contracts/payloads"
import { commentThreadQuery, postCommentPayload, saveReactionPayload } from "@carlnotes/contracts/social"
import {
	addMcpViewPodcastEpisodes,
	callMcpViewTool,
	findMcpViewPodcastEpisode,
	type McpViewToolResult,
	toMcpViewData,
	toToolResultText,
} from "./mcpViewHost"

// a podcast episode's own read, which the podcast player sends to load a podcast episode it plays
const PODCAST_EPISODE_PATH_PATTERN = /^\/api\/episodes\/([^/]+)$/

// a finding's feedback, which the rating block posts
const FINDING_FEEDBACK_PATH_PATTERN = /^\/api\/topic-findings\/([^/]+)\/feedback$/

// a Topic Post's own read, which its info popup sends
const TOPIC_POST_PATH_PATTERN = /^\/api\/topic-posts\/([^/]+)$/

// a comment thread's read and a Comment's post, and a reaction's save
const COMMENTS_PATH = "/api/comments"
const REACTIONS_PATH = "/api/reactions"

/**
 * Installs the MCP view's fetch in place of the browser's.
 */
export function installMcpViewFetch(): void {
	globalThis.fetch = mcpViewFetch as typeof fetch
}

// return a podcast episode read from the tool result, send a finding's feedback, a comment thread's requests, a
// reaction's save, and a Topic Post's read through their tools, and fail every other request
async function mcpViewFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	// the request's path, relative or absolute
	const requestUrl = new URL(
		input instanceof Request ? input.url : input.toString(),
		globalThis.document?.baseURI ?? "http://localhost/",
	)

	// a podcast episode reads from the MCP view data
	const podcastEpisodeId = PODCAST_EPISODE_PATH_PATTERN.exec(requestUrl.pathname)?.[1]
	const podcastEpisode = podcastEpisodeId ? findMcpViewPodcastEpisode(podcastEpisodeId) : null
	if (podcastEpisode) {
		return Response.json(podcastEpisode)
	}

	// a finding's feedback goes through its tool
	const feedbackFindingId = FINDING_FEEDBACK_PATH_PATTERN.exec(requestUrl.pathname)?.[1]
	if (feedbackFindingId) {
		return sendFindingFeedback(feedbackFindingId, init?.body)
	}

	// a comment thread reads and posts through the hot take tools
	const method = (init?.method ?? "GET").toUpperCase()
	if (requestUrl.pathname === COMMENTS_PATH && method === "GET") {
		return readCommentThread(requestUrl.searchParams)
	}
	if (requestUrl.pathname === COMMENTS_PATH && method === "POST") {
		return postComment(init?.body)
	}

	// a reaction saves through its tool
	if (requestUrl.pathname === REACTIONS_PATH && method === "PUT") {
		return saveReaction(init?.body)
	}

	// a Topic Post reads through its tool, and any other request fails
	const topicPostId = TOPIC_POST_PATH_PATTERN.exec(requestUrl.pathname)?.[1]
	if (topicPostId && method === "GET") {
		return readTopicPost(decodeURIComponent(topicPostId))
	}
	return Response.json({ error: "a view reads only what its tool returned" }, { status: 503 })
}

// send a finding's feedback through its tool, returning the response the rating block's request expects
async function sendFindingFeedback(findingId: string, requestBody: RequestInit["body"]): Promise<Response> {
	const { feedback } = findingFeedbackPayload.parse(JSON.parse(String(requestBody)))
	const toolResult = await callMcpViewTool("send_finding_feedback", { finding_id: findingId, feedback })
	return toolResult.isError ? Response.json({ error: "forbidden" }, { status: 403 }) : Response.json({ ok: true })
}

// a tool result as the response a request expects: the part of the result's MCP view data the request reads, or the
// tool's own words as the error of a result that holds none
function toToolResponse(
	toolResult: McpViewToolResult,
	toResponseBody: (mcpViewData: McpViewData) => unknown,
): Response {
	const responseBody = toolResult.isError ? undefined : toResponseBody(toMcpViewData(toolResult._meta))
	return responseBody === undefined
		? Response.json({ error: toToolResultText(toolResult.content) }, { status: 400 })
		: Response.json(responseBody)
}

// read one page of a comment thread through its tool
async function readCommentThread(searchParams: URLSearchParams): Promise<Response> {
	const { kind, id, cursor } = commentThreadQuery.parse(Object.fromEntries(searchParams))
	const toolResult = await callMcpViewTool("read_hot_takes", { target_kind: kind, target_id: id, cursor })
	return toToolResponse(toolResult, ({ commentThread }) => commentThread)
}

// post a Comment or a reply through its tool, returning the Comment as the thread's request expects it
async function postComment(requestBody: RequestInit["body"]): Promise<Response> {
	const { target, body, parentCommentId, chapterPosition } = postCommentPayload.parse(JSON.parse(String(requestBody)))
	const toolResult = await callMcpViewTool("post_hot_take", {
		target_kind: target.kind,
		target_id: target.id,
		body,
		parent_id: parentCommentId,
		chapter_position: chapterPosition,
	})
	return toToolResponse(
		toolResult,
		({ postedComment }) => postedComment && { comment: postedComment, sharedCommentSlots: null },
	)
}

// save a reaction through its tool, returning the summary as the reaction row's request expects it
async function saveReaction(requestBody: RequestInit["body"]): Promise<Response> {
	const { target, reactionType } = saveReactionPayload.parse(JSON.parse(String(requestBody)))
	const toolResult = await callMcpViewTool("save_reaction", {
		target_kind: target.kind,
		target_id: target.id,
		reaction_type: reactionType,
	})
	return toToolResponse(toolResult, ({ reactionSummary }) => reactionSummary && { summary: reactionSummary })
}

// read one Topic Post through its tool, keeping its discussion's recording for the play button
async function readTopicPost(topicPostId: string): Promise<Response> {
	const toolResult = await callMcpViewTool("read_topic_post", { topic_post_id: topicPostId })
	return toToolResponse(toolResult, ({ topicPost, podcastEpisodes }) => {
		addMcpViewPodcastEpisodes(podcastEpisodes)
		return topicPost
	})
}
