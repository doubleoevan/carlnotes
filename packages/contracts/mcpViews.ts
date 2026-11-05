// the MCP views: the MCP view each tool names, and what a tool result gives its MCP view beside the structured result the
// model reads
import type { Visibility } from "./enums"
import type { TopicFinding } from "./findings"
import type { PersonalSourcesSendResult } from "./personalSources"
import type { PodcastEpisode, PodcastEpisodeSummary } from "./podcast"
import type { ProfileIdentity } from "./profiles"
import type { SearchRequest, SearchResultsPage, SearchRow } from "./search"
import type { TopicDraft } from "./topicPayloads"

// the MCP views, and each one's ui resource
export const MCP_VIEWS = ["search", "topic", "findings", "suggest-topics"] as const

export type McpView = (typeof MCP_VIEWS)[number]

/**
 * Returns an MCP view's ui resource uri.
 */
export function toMcpUiResourceUri(mcpView: McpView): string {
	return `ui://carlnotes/${mcpView}.html?v=9`
}

// the key of a tool result's _meta entry that only its MCP view reads
export const MCP_VIEW_META_KEY = "carlnotes/card"

// the topic a findings MCP view heads its rows with: its name, prompt, and visibility, its latest podcast episode, whether
// the caller subscribes to it, and whether the caller may rate and bookmark its findings
export type McpViewTopic = {
	// the topic as its link and its finding notes name it
	id: string
	name: string
	prompt: string
	visibility: Visibility
	// its latest podcast episode, and what the caller may do with it
	latestPodcastEpisode: PodcastEpisodeSummary | null
	isSubscribed: boolean | null
	canRate: boolean
	canBookmark: boolean
}

// what an MCP view reads beside the structured result: the signed-in caller, the podcast episodes its play buttons play,
// and for the findings MCP view, the topic and its findings in the site's own shape
export type McpViewData = {
	session: ProfileIdentity | null
	podcastEpisodes: PodcastEpisode[]
	topic?: McpViewTopic
	topicFindings?: TopicFinding[]
	topicDraftOptions?: { knownTags: string[]; isPodcastEnabledByDefault: boolean }
	sendReceiptLinks?: { entryId: string; links: { url: string; title?: string }[] }[]
}

// the search tool's structured result: the search's page with every row's absolute url, the search that found it, and
// the search page's absolute url
type McpSearchRow = SearchRow & { url: string }

export type McpSearchPage = Omit<SearchResultsPage, "rows"> & {
	rows: McpSearchRow[]
	searchRequest: SearchRequest
	searchUrl: string
}

// what the topic MCP view reads of an edit_topic or create_topic result: the topic, and its fields as saved, created, or
// previewed with each change that needs the user's agreement and the confirmation that saves the preview
export type McpViewTopicResult =
	| PersonalSourcesSendResult
	| { status: "saved" | "created"; topicId: string; afterTopicDraft: TopicDraft | null }
	| { status: "createConfirmRequired"; topicId: null; afterTopicDraft: TopicDraft; confirmation: string }
	| {
			status: "confirmRequired"
			topicId: string
			afterTopicDraft: TopicDraft
			// each change that needs the user's agreement, in words, such as "removes reddit r/agents"
			topicEditChanges: string[]
			confirmation: string
	  }
