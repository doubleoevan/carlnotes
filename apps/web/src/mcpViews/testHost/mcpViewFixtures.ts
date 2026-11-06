// the tool results the MCP view tests send, typed from the MCP view contracts, so a renamed field fails the type check

import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { McpScanStatus } from "@carlnotes/contracts/mcpScanStatus"
import {
	MCP_VIEW_META_KEY,
	type McpSearchPage,
	type McpViewData,
	type McpViewTopic,
	type McpViewTopicResult,
} from "@carlnotes/contracts/mcpViews"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import {
	toPodcastEpisodeFixture,
	toPodcastEpisodeSummaryFixture,
} from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import { toTestTopicFinding, toTestUpdatesFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import type { Updates } from "@carlnotes/contracts/updates"
import { type McpViewToolResult, TEST_SITE_URL } from "./mcpViewTestHost"

// how many bytes the silent podcast episode's audio has
const SILENT_AUDIO_BYTE_COUNT = 4000

/**
 * Returns a number's bytes as a wav file's header stores them.
 */
function toLittleEndianBytes(value: number, byteCount: number): number[] {
	return Array.from({ length: byteCount }, (_, byteIndex) => (value >> (byteIndex * 8)) & 255)
}

// the caller a user's tool result names
const USER_SESSION: McpViewData["session"] = {
	userId: "user-1",
	username: "vienna",
	avatarSource: null,
	avatarVersion: null,
}

// the MCP view data of a user's tool result and of a visitor's
export const USER_MCP_VIEW_DATA: McpViewData = { session: USER_SESSION, podcastEpisodes: [] }
export const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }

// half a second of silence, written here so the frame can play it with no request to the site
const SILENT_AUDIO_URL = `data:audio/wav;base64,${Buffer.from([
	...new TextEncoder().encode("RIFF"),
	...toLittleEndianBytes(SILENT_AUDIO_BYTE_COUNT + 36, 4),
	...new TextEncoder().encode("WAVEfmt "),
	...toLittleEndianBytes(16, 4),
	...toLittleEndianBytes(1, 2),
	...toLittleEndianBytes(1, 2),
	...toLittleEndianBytes(8000, 4),
	...toLittleEndianBytes(8000, 4),
	...toLittleEndianBytes(1, 2),
	...toLittleEndianBytes(8, 2),
	...new TextEncoder().encode("data"),
	...toLittleEndianBytes(SILENT_AUDIO_BYTE_COUNT, 4),
	...new Uint8Array(SILENT_AUDIO_BYTE_COUNT).fill(128),
]).toString("base64")}`

// a topic's latest podcast episode, as its play button and the player read it
export const PODCAST_EPISODE_SUMMARY = toPodcastEpisodeSummaryFixture()
export const PODCAST_EPISODE = toPodcastEpisodeFixture({ audioUrl: SILENT_AUDIO_URL })

// a topic the findings MCP view heads its rows with
export const FINDINGS_TOPIC: McpViewTopic = {
	id: "topic-1",
	name: "LLM tooling",
	prompt: "Tools that run language models",
	visibility: "public",
	latestPodcastEpisode: null,
	isSubscribed: false,
	canRate: true,
	canBookmark: true,
}

// what a visitor may do with the same topic
export const VISITOR_FINDINGS_TOPIC: McpViewTopic = {
	...FINDINGS_TOPIC,
	isSubscribed: null,
	canRate: false,
	canBookmark: false,
}

// two findings of the topic
export const TOPIC_FINDINGS = [
	toTestTopicFinding({ findingId: "finding-1", title: "Agents that read the docs" }),
	toTestTopicFinding({ findingId: "finding-2", title: "Replay sets for evals" }),
]

// a user's findings table, with the sender's private annotation on the first finding
export const PERSONAL_ANNOTATION = "Ask the platform team about this one."
export const FINDINGS_MCP_VIEW_DATA: McpViewData = {
	...USER_MCP_VIEW_DATA,
	topic: FINDINGS_TOPIC,
	topicFindings: TOPIC_FINDINGS,
	personalAnnotations: { "finding-1": PERSONAL_ANNOTATION },
}

// a search for "orbit" with one Team
export const SEARCH_PAGE: McpSearchPage = {
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
			url: `${TEST_SITE_URL}/teams/team-1`,
		},
	],
	rowCount: 1,
	page: 1,
	pageCount: 1,
	pageSize: 10,
	podcastEpisodes: [],
	searchRequest: searchRequestPayload.parse({ q: "orbit", kinds: ["teams"] }),
	searchUrl: `${TEST_SITE_URL}/search?q=orbit&kinds=teams`,
}

// a search with one Topic, which a user may follow
export const TOPIC_SEARCH_PAGE: McpSearchPage = {
	...SEARCH_PAGE,
	rows: [
		{
			kind: "topic",
			id: "topic-1",
			name: "LLM tooling",
			path: "/topics/topic-1/llm-tooling",
			date: null,
			count: null,
			topic: { id: "topic-1", name: "LLM tooling", latestPodcastEpisode: null },
			subscriberCount: 4,
			isSubscribed: false,
			url: `${TEST_SITE_URL}/topics/topic-1/llm-tooling`,
		},
	],
	searchRequest: searchRequestPayload.parse({ q: "llm" }),
}

// text with no place to wrap, as a url or a pasted id may be
const UNBROKEN_TEXT = "unbrokentext".repeat(12)

// a search and a topic's findings with that text in every name and title
export const LONG_SEARCH_PAGE: McpSearchPage = {
	...TOPIC_SEARCH_PAGE,
	rows: TOPIC_SEARCH_PAGE.rows.map((row) => ({ ...row, name: UNBROKEN_TEXT })),
}
export const LONG_FINDINGS_MCP_VIEW_DATA: McpViewData = {
	...USER_MCP_VIEW_DATA,
	topic: { ...FINDINGS_TOPIC, name: UNBROKEN_TEXT },
	topicFindings: [toTestTopicFinding({ findingId: "finding-3", title: UNBROKEN_TEXT })],
}

// the first of a search's two pages, with a Finding that a user may rate and bookmark
export const FINDING_SEARCH_PAGE: McpSearchPage = {
	...SEARCH_PAGE,
	rows: [
		{
			kind: "finding",
			id: "finding-1",
			name: "Agents that read the docs",
			path: `/topics/${FINDINGS_TOPIC.id}`,
			date: null,
			count: null,
			finding: TOPIC_FINDINGS[0] as TopicFinding,
			topic: {
				id: FINDINGS_TOPIC.id,
				name: FINDINGS_TOPIC.name,
				prompt: FINDINGS_TOPIC.prompt,
				visibility: "public",
				canRate: true,
				canBookmark: true,
			},
			url: `${TEST_SITE_URL}/topics/${FINDINGS_TOPIC.id}`,
		},
	],
	rowCount: 11,
	pageCount: 2,
}

// an updates list with an opener, ranked Findings, and more that did not fit
export const UPDATES_RESULT: Updates = {
	opener: "Three things moved while you were out.",
	findings: [
		toTestUpdatesFinding({
			findingId: "finding-4",
			title: "A model router ships",
			topicId: FINDINGS_TOPIC.id,
			topicName: FINDINGS_TOPIC.name,
			topicPath: `/topics/${FINDINGS_TOPIC.id}/llm-tooling`,
		}),
	],
	moreCount: 2,
	morePath: "/",
}

// the MCP view data of an updates list, with each row's Topic
export const UPDATES_MCP_VIEW_DATA: McpViewData = { ...USER_MCP_VIEW_DATA, updatesTopics: [FINDINGS_TOPIC] }

// what a user saved through a checklist's send
export const SEND_CONFIRMATION: Extract<PersonalSourcesSendResult, { status: "accepted" }> = {
	status: "accepted",
	topic: { id: "topic-1", name: "LLM tooling", url: `${TEST_SITE_URL}/topics/topic-1/llm-tooling` },
	entryId: "entry-1",
	title: "Eval drift and replay sets",
	queuedLinkCount: 2,
}

// a preview of an edit that needs the user's agreement
export const TOPIC_EDIT_PREVIEW: Extract<McpViewTopicResult, { status: "confirmRequired" }> = {
	status: "confirmRequired",
	topicId: "topic-1",
	afterTopicDraft: { ...EMPTY_TOPIC_DRAFT, name: "Home espresso", prompt: "Grinders and burrs" },
	topicEditChanges: ["makes the topic public, so anyone can read it"],
	confirmation: "1.a",
}

// the model's fenced copy of an updates list or a Scan status
const MODEL_COPY = { opener: "the model's fenced copy" }

/**
 * Returns a tool result as the api sends it: text for the model, the structured result, and the MCP view's data.
 */
export function toMcpViewToolResult({
	structuredContent,
	mcpViewData,
}: {
	structuredContent?: Record<string, unknown>
	mcpViewData: McpViewData
}): McpViewToolResult {
	return { content: [], structuredContent, _meta: { [MCP_VIEW_META_KEY]: mcpViewData } }
}

/**
 * Returns a read_updates result that holds an updates list.
 */
export function toUpdatesToolResult(updates: Updates = UPDATES_RESULT): McpViewToolResult {
	return toMcpViewToolResult({ structuredContent: MODEL_COPY, mcpViewData: { ...UPDATES_MCP_VIEW_DATA, updates } })
}

/**
 * Returns a read_scan_status result that holds a Scan status.
 */
export function toScanToolResult(
	scanStatus: McpScanStatus,
	mcpViewData: McpViewData = USER_MCP_VIEW_DATA,
): McpViewToolResult {
	return toMcpViewToolResult({ structuredContent: MODEL_COPY, mcpViewData: { ...mcpViewData, scanStatus } })
}
