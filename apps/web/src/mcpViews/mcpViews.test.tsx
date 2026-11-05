// the MCP views: the MCP view fetch returns only what the tool result has, the MCP view's auth client reads the tool result's
// caller, and each MCP view renders the site's own components with its links opening through the host
import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test"
import * as siteAuth from "@carlnotes/client/authClient"
import { MCP_VIEW_META_KEY, type McpSearchPage, type McpViewData } from "@carlnotes/contracts/mcpViews"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { LinkBaseUrlContext, LinkOpenerContext } from "@/components/common/AnchorLink"
import { renderTestHook } from "@/lib/hookTestHarness"
import { FindingsMcpView } from "./FindingsMcpView"
import { authClient } from "./mcpViewAuthClient"
import { installMcpViewFetch } from "./mcpViewFetch"
import { setMcpViewData } from "./mcpViewHost"
import { SearchMcpView } from "./SearchMcpView"
import { TopicMcpView } from "./TopicMcpView"

// a podcast episode the tool result has, in the player's shape
const MCP_VIEW_PODCAST_EPISODE = { id: "episode-1", title: "Agents that read the docs" } as PodcastEpisode

// the MCP view data a tool result has for a signed-in caller
const MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [MCP_VIEW_PODCAST_EPISODE],
	topic: {
		id: "topic-1",
		name: "LLM tooling",
		prompt: "Tools that run language models",
		visibility: "public",
		latestPodcastEpisode: null,
		isSubscribed: false,
		canRate: true,
		canBookmark: true,
	},
	topicFindings: [],
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

// render an MCP view the way the MCP view app does, with every link opening through the host
function renderMcpView(mcpView: React.ReactNode): string {
	return renderToStaticMarkup(<LinkOpenerContext.Provider value={() => {}}>{mcpView}</LinkOpenerContext.Provider>)
}

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

test("the search results render the table and open See all through the host", async () => {
	const mcpSearchPage: McpSearchPage = {
		rows: [
			{
				kind: "team",
				id: "team-1",
				name: "Orbit Club",
				path: "/teams/team-1",
				date: null,
				count: null,
				team: { teamId: "team-1", name: "Orbit Club", avatarVersion: null },
				topicCount: 2,
				memberCount: 5,
				url: "https://carlnotes.test/teams/team-1",
			},
		],
		rowCount: 1,
		page: 1,
		pageCount: 1,
		pageSize: 10,
		podcastEpisodes: [],
		searchRequest: searchRequestPayload.parse({ q: "orbit", kinds: ["teams"] }),
		searchUrl: "https://carlnotes.test/search?q=orbit&kinds=teams",
	}
	const searchMcpViewMarkup = renderMcpView(<SearchMcpView mcpSearchPage={mcpSearchPage} />)
	expect(searchMcpViewMarkup).toContain("Orbit Club")
	expect(searchMcpViewMarkup).toContain("See all on CarlNotes")

	// The host resolves the connected site's origin even if its iframe blocks the document base URL.
	const open = mock(() => {})
	const page = { ...mcpSearchPage, searchUrl: "/search?q=orbit&kinds=teams" }
	const mounted = await renderTestHook(
		() => null,
		() => (
			<LinkBaseUrlContext.Provider value="https://carlnotes.test/">
				<LinkOpenerContext.Provider value={open}>
					<SearchMcpView mcpSearchPage={page} />
				</LinkOpenerContext.Provider>
			</LinkBaseUrlContext.Provider>
		),
	)
	try {
		const link = [...mounted.container.querySelectorAll("a")].find(
			(anchor) => anchor.textContent === "See all on CarlNotes",
		)
		expect(link?.href).toBe(mcpSearchPage.searchUrl)
		await act(async () => link?.click())
		expect(open).toHaveBeenCalledWith(mcpSearchPage.searchUrl)
	} finally {
		await mounted.close()
	}
})

test("the topic MCP view shows a preview with Save and what it changes, and a saved topic without it", () => {
	const topicDraft = { ...EMPTY_TOPIC_DRAFT, name: "Home espresso", prompt: "Grinders and burrs" }
	const previewMarkup = renderMcpView(
		<TopicMcpView
			mcpViewTopicResult={{
				status: "confirmRequired",
				topicId: "topic-1",
				afterTopicDraft: topicDraft,
				topicEditChanges: ["makes the topic public, so anyone can read it"],
				confirmation: "1.a",
			}}
			editTopicArguments={{ topic_id: "topic-1", visibility: "public" }}
		/>,
	)
	expect(previewMarkup).toContain("Home espresso")
	expect(previewMarkup).toContain("Save makes the topic public, so anyone can read it.")
	const savedMarkup = renderMcpView(
		<TopicMcpView
			mcpViewTopicResult={{ status: "saved", topicId: "topic-1", afterTopicDraft: topicDraft }}
			editTopicArguments={null}
		/>,
	)
	expect(savedMarkup).not.toContain(">Save<")
})

test("the findings MCP view heads its rows with the topic and Follow", () => {
	const findingsMcpViewMarkup = renderMcpView(<FindingsMcpView />)
	expect(findingsMcpViewMarkup).toContain("LLM tooling")
	expect(findingsMcpViewMarkup).toContain("Follow")
})

test.each([
	{
		status: "accepted",
		topic: { id: "topic", name: "<script>private</script>".repeat(8), url: "https://carlnotes.test/topics/topic" },
		entryId: "entry",
		title: "☕".repeat(200),
		queuedLinkCount: 2,
	},
	{ status: "quota", resetAt: "2026-11-03T00:00:00.000Z" },
	{ status: "disconnected" },
	{ status: "unavailable", reason: "disabled" },
	{ status: "conflict", reason: "removed" },
] satisfies PersonalSourcesSendResult[])("send outcomes render safely with no resend control: %s", (result) => {
	const markup = renderMcpView(
		<TopicMcpView
			mcpViewTopicResult={result}
			editTopicArguments={{ summary: "private-canary", chat_url: "https://claude.ai/chat/private" }}
		/>,
	)
	expect(markup).toContain('role="status"')
	expect(markup).toContain("break-words")
	expect(markup).not.toContain("private-canary")
	expect(markup).not.toContain("/chat/private")
	expect(markup).not.toContain("<script>")
	expect(markup).not.toContain("<button")
})

// receipt details stay in MCP view metadata while destinations and candidates retain standard links
test("multi-Topic receipts show one bold title and flush numbered links per Topic", () => {
	const receipts = ["humidity", "ventilation"].map((id) => ({
		topic: { id, name: `Moss terrarium ${id}`, url: `http://localhost:5173/topics/${id}` },
		entryId: `entry-${id}`,
		queuedLinkCount: 2,
	}))
	setMcpViewData({
		[MCP_VIEW_META_KEY]: {
			...MCP_VIEW_DATA,
			sendReceiptLinks: receipts.map((receipt) => ({
				entryId: receipt.entryId,
				links: [
					{ url: "https://en.wikipedia.org/wiki/Terrarium", title: "Terrarium - Wikipedia" },
					{ url: "https://example.com/humidity" },
				],
			})),
		},
	})
	const firstReceipt = receipts[0]
	if (!firstReceipt) {
		throw new Error("Missing receipt fixture")
	}
	const markup = renderMcpView(
		<TopicMcpView
			mcpViewTopicResult={{ status: "accepted", title: "Humidity sensors", ...firstReceipt, receipts }}
			editTopicArguments={null}
		/>,
	)
	expect(markup).toContain("<strong>Humidity sensors</strong>")
	expect(markup).toContain("to 2 topics.")
	expect(markup.match(/Links for next brew/g)).toHaveLength(2)
	expect(markup.match(/<ol /g)).toHaveLength(2)
	expect(markup).toContain("Terrarium - Wikipedia")
	expect(markup).toContain("https://example.com/humidity")
	expect(markup.match(/lucide-external-link/g)).toHaveLength(6)
	expect(markup).toContain("text-link hover:underline")
	expect(markup).not.toContain("list-inside")
	expect(markup).not.toContain("pl-")
	setMcpViewData({ [MCP_VIEW_META_KEY]: MCP_VIEW_DATA })
})
