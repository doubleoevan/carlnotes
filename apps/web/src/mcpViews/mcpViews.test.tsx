// the modules an MCP view swaps in for the site's. the fetch returns only what the tool result has, sends a comment
// thread's requests and a reaction's save through their tools, and the auth client reads the tool result's caller
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test"
import * as siteAuth from "@carlnotes/client/authClient"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toTestCommentThread, toTestOwnComment, toTestReactionSummary } from "@carlnotes/contracts/socialTestFixtures"
import { renderToStaticMarkup } from "react-dom/server"
import { authClient } from "./mcpViewAuthClient"
import { installMcpViewFetch } from "./mcpViewFetch"
import * as host from "./mcpViewHost"
import { setMcpViewData } from "./mcpViewHost"

// a podcast episode the tool result has, in the player's shape
const MCP_VIEW_PODCAST_EPISODE = { id: "episode-1", title: "Agents that read the docs" } as PodcastEpisode

// the MCP view data a tool result has for a signed-in caller
const MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [MCP_VIEW_PODCAST_EPISODE],
}

// the browser's fetch, put back after the tests
const browserFetch = globalThis.fetch
let restoreSiteAuth: () => void

// the MCP view's fetch and data for every test
beforeAll(() => {
	// The production MCP view bundle substitutes the tool caller's session for the website's live auth client.
	const session = spyOn(siteAuth, "authClient").mockReturnValue(authClient() as unknown as siteAuth.AuthClient)
	restoreSiteAuth = () => session.mockRestore()
	installMcpViewFetch()
	setMcpViewData({ [MCP_VIEW_META_KEY]: MCP_VIEW_DATA })
})
afterAll(() => {
	restoreSiteAuth()
	globalThis.fetch = browserFetch
})

test("the MCP view fetch returns a podcast episode from the tool result and fails every other request", async () => {
	const podcastEpisodeResponse = await fetch("/api/episodes/episode-1")
	expect(await podcastEpisodeResponse.json()).toEqual(MCP_VIEW_PODCAST_EPISODE)
	expect((await fetch("/api/episodes/episode-2")).status).toBe(503)
	expect((await fetch("/api/topics/topic-1")).status).toBe(503)
})

// a request with a json body, as the site's api client sends one
function toJsonRequest(method: string, body: unknown): RequestInit {
	return { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
}

test("a comment thread reads and posts through the hot take tools, and a reaction saves through its tool", async () => {
	// each tool returns what its MCP view reads
	const commentThread = toTestCommentThread()
	const postedComment = toTestOwnComment()
	const reactionSummary = toTestReactionSummary()
	const mcpViewDataByToolName: Record<string, Partial<McpViewData>> = {
		read_hot_takes: { commentThread },
		post_hot_take: { postedComment },
		save_reaction: { reactionSummary },
	}
	const callMcpViewTool = spyOn(host, "callMcpViewTool").mockImplementation(async (toolName) => ({
		content: [],
		_meta: { [MCP_VIEW_META_KEY]: { ...MCP_VIEW_DATA, ...mcpViewDataByToolName[toolName] } },
	}))
	const target = { kind: "post", id: "post-1" }

	try {
		// a page of the thread, a post with the post as its target, and a reaction
		const threadResponse = await fetch("/api/comments?kind=post&id=post-1&cursor=next")
		expect(await threadResponse.json()).toEqual(commentThread)
		const postResponse = await fetch("/api/comments", toJsonRequest("POST", { target, body: "hello" }))
		expect(await postResponse.json()).toEqual({ comment: postedComment, sharedCommentSlots: null })
		const reactionResponse = await fetch("/api/reactions", toJsonRequest("PUT", { target, reactionType: "like" }))
		expect(await reactionResponse.json()).toEqual({ summary: reactionSummary })
		expect(callMcpViewTool.mock.calls).toEqual([
			["read_hot_takes", { target_kind: "post", target_id: "post-1", cursor: "next" }],
			["post_hot_take", { target_kind: "post", target_id: "post-1", body: "hello" }],
			["save_reaction", { target_kind: "post", target_id: "post-1", reaction_type: "like" }],
		])

		// a tool that rejects a write returns its own words as the request's error
		callMcpViewTool.mockResolvedValue({ content: [{ type: "text", text: "Accept the updated Terms." }], isError: true })
		const rejectedResponse = await fetch("/api/comments", toJsonRequest("POST", { target, body: "hello" }))
		expect(rejectedResponse.status).toBe(400)
		expect(await rejectedResponse.json()).toEqual({ error: "Accept the updated Terms." })
	} finally {
		callMcpViewTool.mockRestore()
	}
})

test("the MCP view's auth client reads the tool result's caller", () => {
	function SessionUsername() {
		const { data: session } = authClient().useSession()
		return <span>{(session?.user as { username?: string } | undefined)?.username ?? "visitor"}</span>
	}
	expect(renderToStaticMarkup(<SessionUsername />)).toBe("<span>vienna</span>")
})
