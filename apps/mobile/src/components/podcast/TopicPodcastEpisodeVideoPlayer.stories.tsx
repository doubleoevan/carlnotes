import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { TopicPodcastEpisodeVideoPlayer } from "./TopicPodcastEpisodeVideoPlayer"

const meta: Meta<typeof TopicPodcastEpisodeVideoPlayer> = {
	title: "Podcast/TopicPodcastEpisodeVideoPlayer",
	component: TopicPodcastEpisodeVideoPlayer,
	args: { podcastEpisode: PODCAST_STORY_FILM_EPISODE },
	parameters: { webReference: "apps/web/src/components/podcast/TopicPodcastEpisodeVideoPlayer.tsx at 375px" },
	decorators: [
		(Story) => (
			<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
				<ScrollView className="w-full" contentContainerClassName="p-4">
					<Story />
				</ScrollView>
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>

// the play button over the film's poster, which waits for a press. the skips and the speed show at the left of the
// control row before the film plays, and a press on one starts the film. the mute control sits beside captions, and a
// press on the playing film's frame pauses it
export const Poster: Story = {}

// the player in the card that the topic screen and the podcast episode screen show it in
export const Card: Story = { args: { isCard: true } }
