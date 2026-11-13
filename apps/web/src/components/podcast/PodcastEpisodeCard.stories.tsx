// the podcast episode card: an episode with its topic's image, one whose topic has no image yet, one with a film, and
// the film card, with the film's own image under its play button, on the home and on a profile
import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisodeCard as PodcastEpisodeCardFields } from "@carlnotes/contracts/home"
import { PODCAST_STORY_FILM_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, within } from "storybook/test"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../../.storybook/fixtures/podcastEpisodes"
import { SAMPLE_TOPIC_IMAGE } from "../../../.storybook/fixtures/topics"
import { findVisibleByRole } from "../../../.storybook/play"
import { PodcastEpisodeCard } from "./PodcastEpisodeCard"

// a published episode of a topic with an image
const PODCAST_EPISODE_CARD: PodcastEpisodeCardFields = {
	podcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
	topic: {
		id: "topic-1",
		name: "Home espresso",
		path: "/topics/topic-1/home-espresso",
		image: SAMPLE_TOPIC_IMAGE,
	},
	reactionCount: 7,
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

// the recording placeholder stands in for a film's own image, which differs from the podcast episode's
const FILM_POSTER_URL = "/podcast-cover-recording.jpg"

// a podcast episode with a film that has its own image. its podcast card is a podcast card like any other
const FILM_PODCAST_EPISODE_CARD: PodcastEpisodeCardFields = {
	...PODCAST_EPISODE_CARD,
	podcastEpisode: { ...LATEST_PODCAST_EPISODE_FIXTURE, hasVideo: true, videoPosterUrl: FILM_POSTER_URL },
}
export const WithFilm: Story = { args: { podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD } }

// a film card, as Featured films and New films this week show it, has the film's own image in the card's frame and
// the film player's round play button, named for the film, centered over that image. its title row has only the title
export const FilmCard: Story = {
	args: { podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD, variant: "video", videoSurface: "home-videos" },
	play: async ({ canvas, canvasElement }) => {
		// the film's own image, and one button on the card
		const image = canvasElement.querySelector("img")
		await expect(image).toHaveAttribute("src", FILM_POSTER_URL)
		const playButton = canvas.getByRole("button", { name: "Play film" })
		await expect(playButton).toBeVisible()
		await expect(canvas.getAllByRole("button")).toHaveLength(1)

		// the button sits inside the image, after the title's link in focus order
		const imageBox = image?.getBoundingClientRect()
		const playButtonBox = playButton.getBoundingClientRect()
		await expect(playButtonBox.top).toBeGreaterThan(imageBox?.top ?? Number.POSITIVE_INFINITY)
		await expect(playButtonBox.bottom).toBeLessThan(imageBox?.bottom ?? 0)
		await expect(canvas.getByRole("link").compareDocumentPosition(playButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
	},
}

// a film with no image of its own shows the podcast episode's image, or its topic's
export const FilmCardWithoutOwnImage: Story = {
	args: {
		podcastEpisodeCard: {
			...FILM_PODCAST_EPISODE_CARD,
			podcastEpisode: { ...FILM_PODCAST_EPISODE_CARD.podcastEpisode, videoPosterUrl: null },
		},
		variant: "video",
	},
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("img")).toHaveAttribute("src", SAMPLE_TOPIC_IMAGE.page.url)
	},
}

// pressing the play button over a film card's image opens the Video dialog and plays the film
export const VideoDialog: Story = {
	args: { podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD, variant: "video" },
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockResolvedValue(PODCAST_STORY_FILM_EPISODE)
	},
	play: async ({ canvas, userEvent }) => {
		// the dialog fades in over the card
		await canvas.getByRole("button", { name: "Play film" }).click()
		const dialog = await findVisibleByRole("dialog")

		// the film plays in the dialog, so pause it on its frame for the image capture
		await userEvent.click(await within(dialog).findByRole("button", { name: /^Pause/ }))
	},
}

// a podcast episode with a film in a profile's Featured Podcasts is a podcast card like any other, with no film button
export const ProfileWithFilm: Story = {
	args: { podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Video" })).not.toBeInTheDocument()
	},
}

// a film card in a profile's Featured Films has the film's play button over its image, reported as the profile's films
export const ProfileFilmCard: Story = {
	args: { podcastEpisodeCard: FILM_PODCAST_EPISODE_CARD, variant: "video", videoSurface: "profile-videos" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Play film" })).toBeInTheDocument()
		await expect(canvas.queryByRole("button", { name: "Video" })).toBeNull()
	},
}
