// the mcp findings card: the feed's finding rows under the topic's name, its play button, and Follow. a signed-in
// caller's thumbs, bookmark, and done call their tools through the host, which a story has none of
import { MCP_CARD_META_KEY, type McpCardData } from "@carlnotes/contracts/mcpCards"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../.storybook/fixtures/podcastEpisodes"
import { toStoryTopicFinding } from "../../.storybook/fixtures/topicFeed"
import { setCardData } from "./cardHost"
import { FindingsCard } from "./FindingsCard"

// a topic's card data for a caller who may or may not rate it and subscribe to it
function toFindingsCardData(isSignedIn: boolean): McpCardData {
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
	title: "MCP cards/FindingsCard",
	component: FindingsCard,
	parameters: { session: "visitor", surface: "card" },
} satisfies Meta<typeof FindingsCard>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's card: the rows and the play button, with no Follow and no buttons that need an account
export const Visitor: Story = { beforeEach: () => setCardData({ [MCP_CARD_META_KEY]: toFindingsCardData(false) }) }

// a signed-in caller's card, with Follow and each row's thumbs, bookmark, and done
export const SignedIn: Story = {
	beforeEach: () => setCardData({ [MCP_CARD_META_KEY]: toFindingsCardData(true) }),
	parameters: { session: "user" },
}
