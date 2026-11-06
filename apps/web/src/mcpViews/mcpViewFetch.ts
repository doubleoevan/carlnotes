// the fetch an MCP view runs with. the MCP view's security policy names no connections, so the api requests the site's
// components make are returned here. a podcast episode the player loads comes from the tool result, a finding's
// feedback goes to its tool, and every other request fails
import { findingFeedbackPayload } from "@carlnotes/contracts/payloads"
import { callMcpViewTool, findMcpViewPodcastEpisode } from "./mcpViewHost"

// a podcast episode's own read, which the podcast player sends to load a podcast episode it plays
const PODCAST_EPISODE_PATH_PATTERN = /^\/api\/episodes\/([^/]+)$/

// a finding's feedback, which the rating block posts
const FINDING_FEEDBACK_PATH_PATTERN = /^\/api\/topic-findings\/([^/]+)\/feedback$/

/**
 * Installs the MCP view's fetch in place of the browser's.
 */
export function installMcpViewFetch(): void {
	globalThis.fetch = mcpViewFetch as typeof fetch
}

// return a podcast episode read from the tool result, send a finding's feedback through its tool, and fail every other
// request
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
	return Response.json({ error: "a view reads only what its tool returned" }, { status: 503 })
}

// send a finding's feedback through its tool, returning the response the rating block's request expects
async function sendFindingFeedback(findingId: string, requestBody: RequestInit["body"]): Promise<Response> {
	const { feedback } = findingFeedbackPayload.parse(JSON.parse(String(requestBody)))
	const toolResult = await callMcpViewTool("send_finding_feedback", { finding_id: findingId, feedback })
	return toolResult.isError ? Response.json({ error: "forbidden" }, { status: 403 }) : Response.json({ ok: true })
}
