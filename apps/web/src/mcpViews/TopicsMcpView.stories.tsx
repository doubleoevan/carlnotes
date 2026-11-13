// the topics MCP view: a list_topics page as the home's topic cards under its section of the topics page, or a
// topic's similar topics as the topic's page lists them. a story has no host
import type { TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import { MCP_VIEW_META_KEY, type McpViewData, type McpViewTopics } from "@carlnotes/contracts/mcpViews"
import { EMPTY_TOPIC_SECTION } from "@carlnotes/core/lib/topicFeedLabels"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../.storybook/fixtures/podcastEpisodes"
import { SAMPLE_TOPIC_IMAGE } from "../../.storybook/fixtures/topics"
import { setMcpViewData } from "./mcpViewHost"
import { NO_SIMILAR_TOPICS_TEXT, TopicsMcpView } from "./TopicsMcpView"

// how the MCP view differs from the topics page and the topic page, which a frame cannot match
const DIFFERENCES_FROM_THE_PAGE = [
	"The MCP view differs from its pages where a frame cannot do what a page does.",
	"A section shows the tool's one section of the topics page as the home's topic cards, six to a page, where the topics page lists every section as rows, five to a page.",
	"The MCP view shows the tool's first page of up to 20 topics, and See all on CarlNotes opens the topics page.",
	"The whole list, with no section, is titled Topics.",
	"An empty section's line is text, with no button that starts a topic.",
	"A card's press reads the Topic's findings in the MCP view, where the page opens the topic page. A byline still opens the profile or the team on the site.",
	"Similar topics sit under the topic's name in place of under the topic page's sections, and a name reads that Topic's findings in the MCP view.",
	"A topic with no similar topic shows a line where the topic page shows nothing.",
].join(" ")

// the MCP view data of a visitor's read and of a user's
const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }
const USER_MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [],
}

// a topic's card as the home shows it
function toStoryTopicCard(topicCard: Pick<TopicCardFields, "id" | "name"> & Partial<TopicCardFields>): TopicCardFields {
	return {
		path: `/topics/${topicCard.id}`,
		image: SAMPLE_TOPIC_IMAGE,
		tags: ["coffee"],
		owner: { userId: "user-carl", username: "carl", avatarSource: "generated", avatarVersion: null },
		teamLink: null,
		reactionCount: 0,
		latestPodcastEpisode: null,
		...topicCard,
	}
}

// the popular section's cards: one with a podcast episode and reactions, a team's, and one with no image yet
const POPULAR_TOPIC_CARDS = [
	toStoryTopicCard({
		id: "topic-1",
		name: "Home espresso",
		tags: ["coffee", "gear"],
		reactionCount: 12,
		latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
	}),
	toStoryTopicCard({
		id: "topic-2",
		name: "Pour over",
		teamLink: { teamId: "team-1", name: "Coffee's for Closers", avatarVersion: null },
	}),
	toStoryTopicCard({ id: "topic-3", name: "Green bean sourcing", image: null, tags: [] }),
]

// the popular section a visitor reads, and the user's own section
const POPULAR_SECTION: McpViewTopics = {
	kind: "section",
	sectionKey: "popular",
	topicCards: POPULAR_TOPIC_CARDS,
	hasMoreTopics: false,
}
const YOURS_SECTION: McpViewTopics = {
	...POPULAR_SECTION,
	sectionKey: "yours",
	topicCards: POPULAR_TOPIC_CARDS.slice(0, 2),
}

// a topic's similar topics, the first with a podcast episode
const SIMILAR_TOPICS: McpViewTopics = {
	kind: "similarTopics",
	topicName: "Home espresso",
	relatedTopics: [
		{ id: "topic-2", name: "Pour over", latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE },
		{ id: "topic-3", name: "Green bean sourcing", latestPodcastEpisode: null },
		{ id: "topic-4", name: "Grinder burrs", latestPodcastEpisode: null },
	],
}

const meta = {
	title: "MCP Apps/MCP views/TopicsMcpView",
	component: TopicsMcpView,
	args: { mcpViewTopics: POPULAR_SECTION },
	parameters: { surface: "page", docs: { description: { component: DIFFERENCES_FROM_THE_PAGE } } },
} satisfies Meta<typeof TopicsMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's popular section: the section's title and count over the home's cards
export const Visitor: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: VISITOR_MCP_VIEW_DATA }),
	parameters: { session: "visitor" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: /Popular topics/ })).toBeVisible()
		await expect(canvas.getByRole("link", { name: "Open Home espresso" })).toBeVisible()
	},
}

// a user's own topics
export const SignedIn: Story = {
	args: { mcpViewTopics: YOURS_SECTION },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: USER_MCP_VIEW_DATA }),
	parameters: { session: "user" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: /Your topics/ })).toBeVisible()
	},
}

// a section with more topics than one tool result holds links to the rest on the topics page
export const WithMoreTopics: Story = {
	...Visitor,
	args: { mcpViewTopics: { ...POPULAR_SECTION, hasMoreTopics: true } },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: "See all on CarlNotes" })).toBeVisible()
	},
}

// a section with no topic shows the section's empty line
export const Empty: Story = {
	...SignedIn,
	args: { mcpViewTopics: { ...YOURS_SECTION, topicCards: [] } },
	play: async ({ canvas }) => {
		await expect(canvas.getByText(EMPTY_TOPIC_SECTION)).toBeVisible()
	},
}

// a topic's similar topics under the topic's name, each name with its podcast episode's play button
export const SimilarTopics: Story = {
	...SignedIn,
	args: { mcpViewTopics: SIMILAR_TOPICS },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Home espresso")).toBeVisible()
		await expect(canvas.getByRole("link", { name: "Pour over" })).toBeVisible()
	},
}

// a topic with no similar topic shows the empty line
export const NoSimilarTopics: Story = {
	...SignedIn,
	args: { mcpViewTopics: { ...SIMILAR_TOPICS, relatedTopics: [] } },
	play: async ({ canvas }) => {
		await expect(canvas.getByText(NO_SIMILAR_TOPICS_TEXT)).toBeVisible()
	},
}
