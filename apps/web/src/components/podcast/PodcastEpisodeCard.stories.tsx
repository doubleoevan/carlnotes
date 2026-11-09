// the podcast episode card: an episode with its topic's image, and one whose topic has no image yet
import type { PodcastEpisodeCard as PodcastEpisodeCardFields } from "@carlnotes/contracts/home"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../../.storybook/fixtures/podcastEpisodes"
import { PodcastEpisodeCard } from "./PodcastEpisodeCard"

// the podcast cover placeholder stands in for a topic's image, which the app serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

// a published episode of a topic with an image
const PODCAST_EPISODE_CARD: PodcastEpisodeCardFields = {
	podcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
	topic: {
		id: "topic-1",
		name: "Home espresso",
		path: "/topics/topic-1/home-espresso",
		image: { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES },
	},
}

const meta = {
	title: "Podcast/PodcastEpisodeCard",
	component: PodcastEpisodeCard,
	args: { podcastEpisodeCard: PODCAST_EPISODE_CARD },
	decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof PodcastEpisodeCard>

export default meta
type Story = StoryObj<typeof meta>

// the card as the home page shows it
export const Default: Story = {}

// an episode of a topic whose image has not rendered shows the muted ground
export const NoImage: Story = {
	args: { podcastEpisodeCard: { ...PODCAST_EPISODE_CARD, topic: { ...PODCAST_EPISODE_CARD.topic, image: null } } },
}
