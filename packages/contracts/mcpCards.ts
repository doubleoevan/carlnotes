// the mcp cards: the card each tool names, and what a tool result gives its card beside the structured result the
// model reads
import type { visibilities } from "./enums"
import type { TopicFinding } from "./findings"
import type { PodcastEpisode, PodcastEpisodeSummary } from "./podcast"
import type { ProfileIdentity } from "./profiles"
import type { SearchRequest, SearchResultsPage, SearchRow } from "./search"
import type { TopicDraft } from "./topicPayloads"

// the three cards, and each one's ui resource
export const MCP_CARDS = ["search", "topic", "findings"] as const

export type McpCard = (typeof MCP_CARDS)[number]

/**
 * Returns a card's ui resource uri.
 */
export function toMcpCardUri(mcpCard: McpCard): string {
	return `ui://carlnotes/${mcpCard}.html`
}

// the key of a tool result's _meta entry that only its card reads
export const MCP_CARD_META_KEY = "carlnotes/card"

// the topic a findings card heads its rows with: its name, prompt, and visibility, its latest podcast episode, whether
// the caller subscribes to it, and whether the caller may rate and bookmark its findings
export type McpCardTopic = {
	// the topic as its link and its finding notes name it
	id: string
	name: string
	prompt: string
	visibility: (typeof visibilities)[number]
	// its latest podcast episode, and what the caller may do with it
	latestPodcastEpisode: PodcastEpisodeSummary | null
	isSubscribed: boolean | null
	canRate: boolean
	canBookmark: boolean
}

// what a card reads beside the structured result: the signed-in caller, the podcast episodes its play buttons play,
// and for the findings card, the topic and its findings in the site's own shape
export type McpCardData = {
	session: ProfileIdentity | null
	podcastEpisodes: PodcastEpisode[]
	topic?: McpCardTopic
	topicFindings?: TopicFinding[]
}

// the search tool's structured result: the search's page with every row's absolute url, the search that found it, and
// the search page's absolute url
export type McpSearchRow = SearchRow & { url: string }

export type McpSearchPage = Omit<SearchResultsPage, "rows"> & {
	rows: McpSearchRow[]
	searchRequest: SearchRequest
	searchUrl: string
}

// what the topic card reads of an edit_topic or create_topic result: the topic, and its fields as saved, created, or
// previewed with each change that needs the user's agreement and the confirmation that saves the preview
export type McpTopicCardResult =
	| { status: "saved" | "created"; topicId: string; afterTopicDraft: TopicDraft | null }
	| {
			status: "confirmRequired"
			topicId: string
			afterTopicDraft: TopicDraft
			// each change that needs the user's agreement, in words, such as "removes reddit r/agents"
			topicEditChanges: string[]
			confirmation: string
	  }
