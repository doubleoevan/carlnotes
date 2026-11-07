// the MCP views: the MCP view each tool names, and what a tool result gives its MCP view beside the structured result the
// model reads
import type { TopicFinding } from "./findings"
import type { McpScanStatus } from "./mcpScanStatus"
import type { PersonalSourcesSendResult } from "./personalSources"
import type { PodcastEpisode, PodcastEpisodeSummary } from "./podcast"
import type { ProfileIdentity } from "./profiles"
import type { FindingSearchTopic, SearchRequest, SearchResultsPage, SearchRow } from "./search"
import type { ReactionSummary } from "./social"
import type { TopicDraft } from "./topicPayloads"
import type { Updates } from "./updates"

// the MCP views, and each one's ui resource
export const MCP_VIEWS = ["search", "topic", "findings", "suggest-topics", "updates", "scan"] as const

export type McpView = (typeof MCP_VIEWS)[number]

// the version of the MCP view bundle a running api builds, always above every stored version
export const MCP_VIEW_VERSION = 9

/**
 * Returns an MCP view's ui resource uri at a version, the current one by default.
 */
export function toMcpUiResourceUri(mcpView: McpView, version = MCP_VIEW_VERSION): string {
	return `ui://carlnotes/${mcpView}.html?v=${version}`
}

// the key of a tool result's _meta entry that only its MCP view reads
export const MCP_VIEW_META_KEY = "carlnotes/card"

// the topic a findings MCP view heads its rows with: a finding row's topic, its latest podcast episode, and whether the
// caller subscribes to it
export type McpViewTopic = FindingSearchTopic & {
	latestPodcastEpisode: PodcastEpisodeSummary | null
	isSubscribed: boolean | null
}

// what an MCP view reads beside the structured result: the signed-in caller, the podcast episodes its play buttons play,
// for the findings MCP view, the topic and its findings in the site's own shape, for the updates MCP view, each row's
// Topic and the list, and for the scan MCP view, the status
export type McpViewData = {
	session: ProfileIdentity | null
	podcastEpisodes: PodcastEpisode[]
	topic?: McpViewTopic
	topicFindings?: TopicFinding[]
	updatesTopics?: FindingSearchTopic[]
	updates?: Updates
	scanStatus?: McpScanStatus
	// the caller's own private annotations on the page's findings, by finding id
	personalAnnotations?: Record<string, string>
	topicDraftOptions?: { knownTags: string[]; isPodcastEnabledByDefault: boolean }
	sendConfirmationLinks?: { entryId: string; links: { url: string; title?: string }[] }[]
	// the social target's reactions as they stand after the save_reaction tool saved one
	reactionSummary?: ReactionSummary
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
