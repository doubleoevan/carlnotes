// the MCP views: the MCP view each tool names, and what a tool result gives its MCP view beside the structured result the
// model reads

import type { ActivityResponse, MonthlySpend } from "./activity"
import type { ChatRoomMessagePage } from "./chat"
import type { UnseenCommentMention } from "./commentMentions"
import type { DashboardKind, DashboardResponse } from "./dashboards"
import type { TopicFinding } from "./findings"
import type { TopicCard } from "./home"
import type { McpScanStatus } from "./mcpScanStatus"
import type { NewsResponse, NewsWindow } from "./news"
import type { NoteResponse, NotesResponse } from "./notes"
import type { PersonalSourcesSendResult } from "./personalSources"
import type { PodcastEpisode, PodcastEpisodeSummary } from "./podcast"
import type { ProfileResponse } from "./profilePage"
import type { BillingState, ProfileIdentity } from "./profiles"
import type { FindingSearchTopic, SearchRequest, SearchResultsPage, SearchRow } from "./search"
import type { Comment, CommentThreadResponse, ReactionSummary } from "./social"
import type { TeamPageResponse } from "./teams"
import type { TopicImageUrls } from "./topicImages"
import type { TopicDraft } from "./topicPayloads"
import type { TopicPostCard, TopicPostResponse } from "./topicPosts"
import type { RelatedTopicsResponse, TopicSectionKey } from "./topics"
import type { Updates } from "./updates"

// the MCP views, and each one's ui resource
export const MCP_VIEWS = [
	"search",
	"topic",
	"findings",
	"suggest-topics",
	"updates",
	"scan",
	"news",
	"topic-posts",
	"topic-post",
	"dashboard",
	"note",
	"team",
	"profile",
	"activity",
	"account",
	"topics",
] as const

export type McpView = (typeof MCP_VIEWS)[number]

// the version of the MCP view bundle a running api builds, always above every stored version
export const MCP_VIEW_VERSION = 12

/**
 * Returns an MCP view's ui resource uri at a version, the current one by default.
 */
export function toMcpUiResourceUri(mcpView: McpView, version = MCP_VIEW_VERSION): string {
	return `ui://carlnotes/${mcpView}.html?v=${version}`
}

// the key of a tool result's _meta entry that only its MCP view reads
export const MCP_VIEW_META_KEY = "carlnotes/card"

// how many News Events one read_news result holds, which the news MCP view cuts into the list's pages
export const MCP_NEWS_PAGE_SIZE = 20

// what the news MCP view reads of a read_news result: the window, the caller's unseen Comment Mentions on a first
// page, the page of News Events in the site's shape, and the cursor of the next page, null on the last
export type McpViewNews = {
	window: NewsWindow
	commentMentions: UnseenCommentMention[]
	newsPage: NewsResponse
	nextCursor: string | null
}

// the read_dashboard tool's dashboardKind value for each Dashboard kind
export const DASHBOARD_TOOL_KINDS = {
	topicDashboard: "topics",
	podcastDashboard: "podcasts",
	teamDashboard: "team",
} as const satisfies Record<DashboardKind, string>

// what the dashboard MCP view reads of a read_dashboard result: whose Dashboard it is, whether the caller reads the
// full snapshot, and one selection's read
export type McpViewDashboard = {
	dashboardKind: DashboardKind
	subjectId: string
	hasFullAccess: boolean
	dashboard: DashboardResponse
}

// the topic a findings MCP view heads its rows with: a finding row's topic, its latest podcast episode, and whether the
// caller subscribes to it
export type McpViewTopic = FindingSearchTopic & {
	latestPodcastEpisode: PodcastEpisodeSummary | null
	isSubscribed: boolean | null
	// the topic's image at every size, null until its first render lands
	image: TopicImageUrls | null
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
	news?: McpViewNews
	// one page of a Topic's published Topic Posts, newest first
	topicPosts?: TopicPostCard[]
	// one Topic Post as its page shows it, with the first page of its comment thread
	topicPost?: TopicPostResponse
	// one page of a comment thread as the read_hot_takes tool read it, and the Comment the post_hot_take tool posted
	commentThread?: CommentThreadResponse
	postedComment?: Comment
	// one Dashboard's read as the read_dashboard tool read it
	dashboard?: McpViewDashboard
	notes?: McpViewNotes
	team?: McpViewTeam
	profile?: McpViewProfile
	activity?: McpViewActivity
	account?: McpViewAccount
	topics?: McpViewTopics
}

// what the note MCP view reads of a read_notes or save_note result: the page's notes, and the note it opened with its
// html and version, or null for the list alone
export type McpViewNotes = {
	pageType: "topic" | "team"
	pageId: string
	notesResponse: NotesResponse
	openedNote: NoteResponse | null
}

// what the team MCP view reads of a read_team result: the team page, its notes, and for a member the room's newest
// messages with the cursor of the older ones
export type McpViewTeam = {
	teamPage: TeamPageResponse
	notesResponse: NotesResponse | null
	chatMessagePage: ChatRoomMessagePage | null
}

// what the profile MCP view reads of a read_profile result: the profile, and the first page of its news
export type McpViewProfile = {
	profile: ProfileResponse
	newsPage: NewsResponse | null
	// whether the profile is the caller's own, which shows the owner's topics and teams
	isOwnProfile: boolean
}

// what the activity MCP view reads of a read_activity result: the caller's activity as the Activity page reads it
export type McpViewActivity = {
	activity: ActivityResponse
}

// what the account MCP view reads of a read_account result: the billing state and the month's spend meter
export type McpViewAccount = {
	billing: BillingState
	spendMeter: MonthlySpend
}

// what the topics MCP view reads of a list_topics result. a section is a page of topic cards with whether more
// follow, and its key is null for the whole list. similar topics are the topics like one topic
export type McpViewTopics =
	| { kind: "section"; sectionKey: TopicSectionKey | null; topicCards: TopicCard[]; hasMoreTopics: boolean }
	| { kind: "similarTopics"; topicName: string; relatedTopics: RelatedTopicsResponse["relatedTopics"] }

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
	| {
			status: "saved" | "created"
			topicId: string
			afterTopicDraft: TopicDraft | null
			// the image set_topic_image saved, which a regenerate leaves null while it renders
			image?: TopicImageUrls | null
	  }
	| { status: "createConfirmRequired"; topicId: null; afterTopicDraft: TopicDraft; confirmation: string }
	| {
			status: "confirmRequired"
			topicId: string
			afterTopicDraft: TopicDraft
			// each change that needs the user's agreement, in words, such as "removes reddit r/agents"
			topicEditChanges: string[]
			confirmation: string
	  }
