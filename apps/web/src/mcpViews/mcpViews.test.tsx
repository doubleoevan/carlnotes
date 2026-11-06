// the modules an MCP view swaps in for the site's. the fetch returns only what the tool result has, and the auth
// client reads the tool result's caller
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test"
import * as siteAuth from "@carlnotes/client/authClient"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { renderToStaticMarkup } from "react-dom/server"
import { authClient } from "./mcpViewAuthClient"
import { installMcpViewFetch } from "./mcpViewFetch"
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

test("the MCP view's auth client reads the tool result's caller", () => {
	function SessionUsername() {
		const { data: session } = authClient().useSession()
		return <span>{(session?.user as { username?: string } | undefined)?.username ?? "visitor"}</span>
	}
	expect(renderToStaticMarkup(<SessionUsername />)).toBe("<span>vienna</span>")
})
