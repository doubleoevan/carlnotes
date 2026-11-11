import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { TopicPodcastEpisodeVideoDialog } from "./TopicPodcastEpisodeVideoDialog"

const meta = {
	title: "Podcast/TopicPodcastEpisodeVideoDialog",
	component: TopicPodcastEpisodeVideoDialog,
	args: {
		podcastEpisodeId: PODCAST_STORY_FILM_EPISODE.id,
		title: PODCAST_STORY_FILM_EPISODE.title ?? "",
		onClose: fn(),
	},
	parameters: { webReference: "apps/web/src/components/podcast/TopicPodcastEpisodeVideoDialog.tsx at 375px" },
	decorators: [
		(Story) => (
			<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
				<Story />
			</PodcastEpisodeStory>
		),
	],
} satisfies Meta<typeof TopicPodcastEpisodeVideoDialog>
export default meta
type Story = StoryObj<typeof meta>

// the dialog on the film's poster, which waits for a press
export const Poster: Story = {
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockResolvedValue(PODCAST_STORY_FILM_EPISODE)
	},
}

// the dialog while the podcast episode loads
export const Loading: Story = {
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockReturnValue(new Promise(() => {}))
	},
}

// the dialog if the podcast episode fails to load
export const Failed: Story = {
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockResolvedValue(null)
	},
}
