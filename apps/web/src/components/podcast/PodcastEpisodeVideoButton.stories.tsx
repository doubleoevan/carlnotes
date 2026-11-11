// the button that opens a film: the play button over a film card's image and a news row's Video pill
import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import { PODCAST_STORY_FILM_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { mocked } from "storybook/test"
import { PodcastEpisodeVideoButton } from "./PodcastEpisodeVideoButton"

const meta = {
	title: "Podcast/PodcastEpisodeVideoButton",
	component: PodcastEpisodeVideoButton,
	args: { podcastEpisode: PODCAST_STORY_FILM_EPISODE, label: "Video", surface: "home-news" },
	// a press opens the Video dialog on the story's film, so no story reaches the api
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockResolvedValue(PODCAST_STORY_FILM_EPISODE)
	},
} satisfies Meta<typeof PodcastEpisodeVideoButton>

export default meta
type Story = StoryObj<typeof meta>

// a film card's round play button, the film player's own, which opens the Video dialog and plays the film. it centers
// in the 3:2 frame of a card's image, which the muted box shows here
export const Card: Story = {
	args: { label: "Play film", surface: "home-videos" },
	decorators: [(Story) => <div className="relative aspect-[3/2] w-80 bg-muted">{Story()}</div>],
}

// the pill beside a news row's play pill
export const Pill: Story = { args: { size: "pill", surface: "home-news" } }
