// the mobile button that opens a film, with the web stories' names
import { PODCAST_STORY_FILM_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { PodcastEpisodeVideoButton } from "./PodcastEpisodeVideoButton"

const meta = {
	title: "Podcast/PodcastEpisodeVideoButton",
	component: PodcastEpisodeVideoButton,
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodeVideoButton.stories.tsx at 375px" },
	args: { podcastEpisode: PODCAST_STORY_FILM_EPISODE, label: "Video", surface: "home-news" },
} satisfies Meta<typeof PodcastEpisodeVideoButton>

export default meta
type Story = StoryObj<typeof meta>

// a film card's round play button, the film player's own, which opens the Video sheet and plays the film. it centers
// in the 3:2 frame of a card's image, which the muted box shows here
export const Card: Story = {
	args: { label: "Play film", surface: "home-videos" },
	render: (args) => (
		<View className="aspect-[3/2] w-80 bg-muted">
			<PodcastEpisodeVideoButton {...args} />
		</View>
	),
}

// the pill beside a news row's play pill
export const Pill: Story = { args: { size: "pill", surface: "home-news" } }
