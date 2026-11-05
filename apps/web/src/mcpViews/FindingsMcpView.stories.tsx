// the findings MCP view: the feed's finding rows under the topic's name, its play button, and Follow. a signed-in
// caller's thumbs, bookmark, and done call their tools through the host, which a story has none of
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../.storybook/fixtures/podcastEpisodes"
import { toStoryTopicFinding } from "../../.storybook/fixtures/topicFeed"
import { FindingsMcpView } from "./FindingsMcpView"
import { setMcpViewData } from "./mcpViewHost"

// a topic's MCP view data for a caller who may or may not rate it and subscribe to it
function toFindingsMcpViewData(isSignedIn: boolean): McpViewData {
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
	}
}

const meta = {
	title: "MCP Apps/MCP views/FindingsMcpView",
	component: FindingsMcpView,
	parameters: { session: "visitor", surface: "page" },
} satisfies Meta<typeof FindingsMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's MCP view: the rows and the play button, with no Follow and no buttons that need an account
export const Visitor: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: toFindingsMcpViewData(false) }),
}

// a signed-in caller's MCP view, with Follow and each row's thumbs, bookmark, and done
export const SignedIn: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: toFindingsMcpViewData(true) }),
	parameters: { session: "user" },
}
