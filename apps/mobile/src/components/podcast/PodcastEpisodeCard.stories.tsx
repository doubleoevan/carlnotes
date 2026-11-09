// the mobile podcast episode card, with the web stories' names. the ground shows in place of the topic's image
import type { PodcastEpisodeCard as PodcastEpisodeCardFields } from "@carlnotes/contracts/home"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { STORY_PODCAST_EPISODE } from "@/components/topic/topicPageStories"
import { PodcastEpisodeCard } from "./PodcastEpisodeCard"

// a published episode of a topic
const PODCAST_EPISODE_CARD: PodcastEpisodeCardFields = {
	podcastEpisode: STORY_PODCAST_EPISODE,
	topic: { id: "topic-1", name: "Home espresso", path: "/topics/topic-1/home-espresso", image: null },
}

const meta = {
	title: "Podcast/PodcastEpisodeCard",
	component: PodcastEpisodeCard,
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodeCard.stories.tsx at 375px" },
	args: { podcastEpisodeCard: PODCAST_EPISODE_CARD },
	render: (args) => (
		<View className="w-80">
			<PodcastEpisodeCard {...args} />
		</View>
	),
} satisfies Meta<typeof PodcastEpisodeCard>

export default meta
type Story = StoryObj<typeof meta>

// the card as the Home tab shows it
export const Default: Story = {}

// an episode of a topic whose image has not rendered shows the muted ground
export const NoImage: Story = {}
