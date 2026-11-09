// the admin console's featured section: both pin lists, a step down that saves, and the empty lists
import { sendPodcastEpisodeFeatureOrder } from "@carlnotes/client/podcastEpisodeClient"
import { sendTopicFeatureOrder } from "@carlnotes/client/topicClient"
import type { FeaturedTopic } from "@carlnotes/contracts/admin"
import type { FeaturedPodcastEpisode } from "@carlnotes/contracts/podcast"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor } from "storybook/test"
import { FeaturedCard } from "./FeaturedCard"

// two pinned topics and one pinned podcast episode
const FEATURED_TOPICS: FeaturedTopic[] = [
	{ id: "topic-llm-tooling", name: "LLM tooling", featureOrder: 1 },
	{ id: "topic-home-espresso", name: "Home espresso", featureOrder: 2 },
]
const FEATURED_PODCAST_EPISODES: FeaturedPodcastEpisode[] = [
	{
		id: "episode-1",
		title: "Grinders, scales, and the pour",
		topicName: "Home espresso",
		pagePath: "/topics/topic-home-espresso/home-espresso/episodes/2026/4",
		featureOrder: 1,
	},
]

const meta = {
	title: "Admin/FeaturedCard",
	component: FeaturedCard,
	args: { featuredTopics: FEATURED_TOPICS, featuredPodcastEpisodes: FEATURED_PODCAST_EPISODES, onSaved: fn() },
	argTypes: {
		featuredTopics: { control: false },
		featuredPodcastEpisodes: { control: false },
		onSaved: { control: false },
	},
	parameters: { session: "admin" },
	// a move succeeds unless a story says otherwise
	beforeEach: () => {
		mocked(sendTopicFeatureOrder).mockResolvedValue(undefined)
		mocked(sendPodcastEpisodeFeatureOrder).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof FeaturedCard>

export default meta
type Story = StoryObj<typeof meta>

// both lists with their rows
export const Default: Story = {}

// nothing pinned on either list
export const Empty: Story = { args: { featuredTopics: [], featuredPodcastEpisodes: [] } }

// a step down sends the next position and reloads the console
export const MovedDown: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Move LLM tooling down" }))
		await waitFor(() => expect(mocked(sendTopicFeatureOrder)).toHaveBeenCalledWith("topic-llm-tooling", 2))
		await waitFor(() => expect(args.onSaved).toHaveBeenCalled())
	},
}
