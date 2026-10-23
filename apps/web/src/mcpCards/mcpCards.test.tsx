// the mcp cards: the card fetch returns only what the tool result has, the card's auth client reads the tool result's
// caller, and each card renders the site's own components with its links opening through the host
import { afterAll, beforeAll, expect, test } from "bun:test"
import { MCP_CARD_META_KEY, type McpCardData, type McpSearchPage } from "@carlnotes/contracts/mcpCards"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import { renderToStaticMarkup } from "react-dom/server"
import { LinkOpenerContext } from "@/components/common/AnchorLink"
import { authClient } from "./cardAuthClient"
import { installCardFetch } from "./cardFetch"
import { setCardData } from "./cardHost"
import { FindingsCard } from "./FindingsCard"
import { SearchCard } from "./SearchCard"
import { TopicCard } from "./TopicCard"

// a podcast episode the tool result has, in the player's shape
const CARD_PODCAST_EPISODE = { id: "episode-1", title: "Agents that read the docs" } as PodcastEpisode

// the card data a tool result has for a signed-in caller
const CARD_DATA: McpCardData = {
	session: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [CARD_PODCAST_EPISODE],
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

// the card's fetch and data for every test
beforeAll(() => {
	installCardFetch()
	setCardData({ [MCP_CARD_META_KEY]: CARD_DATA })
})
afterAll(() => {
	globalThis.fetch = browserFetch
})

// render a card the way the card app does, with every link opening through the host
function renderCard(card: React.ReactNode): string {
	return renderToStaticMarkup(<LinkOpenerContext.Provider value={() => {}}>{card}</LinkOpenerContext.Provider>)
}

test("the card fetch returns a podcast episode from the tool result and fails every other request", async () => {
	const podcastEpisodeResponse = await fetch("/api/episodes/episode-1")
	expect(await podcastEpisodeResponse.json()).toEqual(CARD_PODCAST_EPISODE)
	expect((await fetch("/api/episodes/episode-2")).status).toBe(503)
	expect((await fetch("/api/topics/topic-1")).status).toBe(503)
})

test("the card's auth client reads the tool result's caller", () => {
	function SessionUsername() {
		const { data: session } = authClient.useSession()
		return <span>{(session?.user as { username?: string } | undefined)?.username ?? "visitor"}</span>
	}
	expect(renderToStaticMarkup(<SessionUsername />)).toBe("<span>vienna</span>")
})

test("the search card renders the search page's table and See all", () => {
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
	const searchCardMarkup = renderCard(<SearchCard mcpSearchPage={mcpSearchPage} />)
	expect(searchCardMarkup).toContain("Orbit Club")
	expect(searchCardMarkup).toContain("See all on CarlNotes")
})

test("the topic card shows a preview with Save and what it changes, and a saved topic without it", () => {
	const topicDraft = { ...EMPTY_TOPIC_DRAFT, name: "Home espresso", prompt: "Grinders and burrs" }
	const previewMarkup = renderCard(
		<TopicCard
			mcpTopicCardResult={{
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
	const savedMarkup = renderCard(
		<TopicCard
			mcpTopicCardResult={{ status: "saved", topicId: "topic-1", afterTopicDraft: topicDraft }}
			editTopicArguments={null}
		/>,
	)
	expect(savedMarkup).not.toContain(">Save<")
})

test("the findings card heads its rows with the topic and Follow", () => {
	const findingsCardMarkup = renderCard(<FindingsCard />)
	expect(findingsCardMarkup).toContain("LLM tooling")
	expect(findingsCardMarkup).toContain("Follow")
})
