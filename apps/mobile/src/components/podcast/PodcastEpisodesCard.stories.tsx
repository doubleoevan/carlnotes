import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { STORY_TOPIC_FEED_HANDLERS } from "@/components/topic/topicFeedStories"
import { STORY_PODCAST_EPISODE, STORY_TOPIC_PAGE, TopicPageStoryProvider } from "@/components/topic/topicPageStories"
import { PodcastEpisodePlayer } from "./PodcastEpisodePlayer"
import { PodcastEpisodesCard } from "./PodcastEpisodesCard"

// the complete fixture exercises the matching web card without account requests
const meta: Meta<typeof PodcastEpisodesCard> = {
	title: "Podcast/PodcastEpisodesCard",
	component: PodcastEpisodesCard,
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodesCard.tsx at 375px" },
	args: { topic: STORY_TOPIC_PAGE },
	decorators: [
		(Story) => (
			<TopicPageStoryProvider>
				<ScrollView className="w-full">
					<Story />
				</ScrollView>
			</TopicPageStoryProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const SeasonsAndPages: Story = {
	args: {
		topic: {
			...STORY_TOPIC_PAGE,
			podcast: STORY_TOPIC_PAGE.podcast
				? {
						...STORY_TOPIC_PAGE.podcast,
						seasons: [2026, 2025],
						latestSeasonPodcastEpisodes: {
							podcastEpisodes: Array.from({ length: 8 }, (_, index) => ({
								...STORY_PODCAST_EPISODE,
								id: `season-episode-${index}`,
								episodeNumber: 8 - index,
							})),
						},
					}
				: null,
		},
	},
}
export const Chapters: Story = {
	render: () => <PodcastEpisodePlayer topic={STORY_TOPIC_PAGE} topicFeedHandlers={STORY_TOPIC_FEED_HANDLERS} />,
}
