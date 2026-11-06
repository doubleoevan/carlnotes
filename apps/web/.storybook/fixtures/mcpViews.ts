import type { McpSearchPage, McpViewData } from "@carlnotes/contracts/mcpViews"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import type { McpViewToolResult } from "@/mcpViews/mcpViewHost"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "./podcastEpisodes"
import { SEARCH_PAGE_FIXTURE } from "./search"
import { toStoryTopicFinding } from "./topicFeed"

// what a tool returns to a visitor if it needs an account, which the MCP view shell shows in place of its route
export const VISITOR_TOOL_RESULT: McpViewToolResult = {
	content: [
		{
			type: "text",
			text: "This needs a connected CarlNotes account. Reading and searching public topics work without one.",
		},
	],
}

// the search page fixture as the search tool returns it, each row with its absolute url
export const MCP_SEARCH_PAGE: McpSearchPage = {
	...SEARCH_PAGE_FIXTURE,
	rows: SEARCH_PAGE_FIXTURE.rows.map((searchRow) => ({ ...searchRow, url: `https://carlnotes.com${searchRow.path}` })),
	searchRequest: searchRequestPayload.parse({ q: "espresso" }),
	searchUrl: "https://carlnotes.com/search?q=espresso",
}

// a topic's MCP view data for a user who may or may not rate it and subscribe to it, or a visitor
export function toFindingsMcpViewData(isSignedIn: boolean): McpViewData {
	return {
		session: isSignedIn ? { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null } : null,
		podcastEpisodes: [],
		topic: {
			id: "topic-llm-tooling",
			name: "LLM tooling",
			prompt: "Releases and evaluations of the tools that run language models.",
			visibility: "public",
			latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
			isSubscribed: isSignedIn ? false : null,
			canRate: isSignedIn,
			canBookmark: isSignedIn,
		},
		topicFindings: [
			toStoryTopicFinding({ findingId: "finding-runtime", title: "A local runtime ships its 2.0 release" }),
			toStoryTopicFinding({
				findingId: "finding-eval",
				title: "An evaluation harness adds tool-call scoring",
				rating: "up",
			}),
			toStoryTopicFinding({ findingId: "finding-bench", title: "Benchmarks for small models", isConsumed: true }),
		],
		personalAnnotations: isSignedIn ? { "finding-eval": "Compare this with our replay sets." } : undefined,
	}
}
