import type { Meta, StoryObj } from "@storybook/react-native"
import { STORY_TOPIC_FEED_HANDLERS } from "@/components/topic/topicFeedStories"
import { STORY_TOPIC_PAGE } from "@/components/topic/topicPageStories"
import { PodcastEpisodePlayerCard } from "./PodcastEpisodePlayerCard"

// compare the same named web component at phone width
const meta: Meta<typeof PodcastEpisodePlayerCard> = {
	title: "Podcast/PodcastEpisodePlayerCard",
	component: PodcastEpisodePlayerCard,
	parameters: {
		webReference: "apps/web/src/components/podcast/PodcastEpisodePlayerCard.tsx at 375px",
		surface: "card",
	},
	args: { topic: STORY_TOPIC_PAGE, topicFeedHandlers: STORY_TOPIC_FEED_HANDLERS },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
