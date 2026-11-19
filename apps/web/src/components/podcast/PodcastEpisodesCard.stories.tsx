import { sendRemovePodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import { toTopicPodcastFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { PodcastEpisodeRemovalProvider } from "@carlnotes/core/components/PodcastEpisodeRemovalProvider"
import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { mocked } from "storybook/test"
import { PodcastEpisodesCard } from "./PodcastEpisodesCard"

// a season of seven podcast episodes, newest first, so the list shows two pages
const podcastEpisodes = Array.from({ length: 7 }, (_, index) => ({
	...PODCAST_STORY_FILM_EPISODE,
	id: `story-podcast-episode-${index}`,
	episodeNumber: 7 - index,
	title: `${PODCAST_STORY_FILM_EPISODE.title} ${7 - index}`,
}))

// a topic with two seasons, and its owner's removal permission
const topic = toTestTopicResponse({
	latestPodcastEpisode: podcastEpisodes[0],
	podcast: toTopicPodcastFixture({
		seasons: [2026, 2025],
		latestSeasonPodcastEpisodes: { podcastEpisodes },
		canRemovePodcastEpisodes: true,
	}),
})

const meta: Meta = {
	title: "Podcast/PodcastEpisodesCard",
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodesCard.tsx at 375px" },
	decorators: [
		(Story) => (
			<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
				<div className="max-w-3xl">
					<Story />
				</div>
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj

export const PodcastEpisodes: Story = {
	render: () => <PodcastEpisodesCard topic={topic} onPodcastEpisodeRemoved={async () => {}} />,
}

// The season list stays usable while the preview server declines a removal.
export const RemovalDeclined: Story = {
	parameters: { session: "user" },
	beforeEach: () => {
		mocked(sendRemovePodcastEpisode).mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 1500))
			return false
		})
	},
	render: () => (
		<PodcastEpisodeRemovalProvider>
			<PodcastEpisodesCard topic={topic} onPodcastEpisodeRemoved={async () => {}} />
		</PodcastEpisodeRemovalProvider>
	),
}
