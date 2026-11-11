// the mobile podcast episode card, with the web stories' names. the ground shows in place of the topic's image
import type { PodcastEpisodeCard as PodcastEpisodeCardFields } from "@carlnotes/contracts/home"
import { PODCAST_STORY_FILM_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { STORY_PODCAST_EPISODE } from "@/components/topic/topicPageStories"
import { PodcastEpisodeCard } from "./PodcastEpisodeCard"

// a published episode of a topic
const PODCAST_EPISODE_CARD: PodcastEpisodeCardFields = {
	podcastEpisode: STORY_PODCAST_EPISODE,
	topic: { id: "topic-1", name: "Home espresso", path: "/topics/topic-1/home-espresso", image: null },
	reactionCount: 7,
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

// a podcast episode with a film is a podcast card like any other
export const WithFilm: Story = {
	args: { podcastEpisodeCard: { ...PODCAST_EPISODE_CARD, podcastEpisode: PODCAST_STORY_FILM_EPISODE } },
}

// a film card, as Featured films and New films this week show it, has the film's own image in the card's frame and
// the film player's round play button centered over that image, which opens the Video sheet and plays the film. its
// title row has only the title
export const FilmCard: Story = {
	args: {
		podcastEpisodeCard: { ...PODCAST_EPISODE_CARD, podcastEpisode: PODCAST_STORY_FILM_EPISODE },
		variant: "video",
		videoSurface: "home-videos",
	},
}

// a podcast episode with a film in a profile's Featured Podcasts is a podcast card like any other, with no film button
export const ProfileWithFilm: Story = {
	args: {
		podcastEpisodeCard: { ...PODCAST_EPISODE_CARD, podcastEpisode: PODCAST_STORY_FILM_EPISODE },
	},
}

// a film card in a profile's Featured Films has the film's play button over its image, reported as the profile's films
export const ProfileFilmCard: Story = {
	args: {
		podcastEpisodeCard: { ...PODCAST_EPISODE_CARD, podcastEpisode: PODCAST_STORY_FILM_EPISODE },
		variant: "video",
		videoSurface: "profile-videos",
	},
}
