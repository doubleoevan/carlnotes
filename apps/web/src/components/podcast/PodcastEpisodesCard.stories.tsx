import { sendRemovePodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import { toTopicPodcastFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { PodcastEpisodeRemovalProvider } from "@carlnotes/core/components/PodcastEpisodeRemovalProvider"
import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { mocked } from "storybook/test"
import { PodcastEpisodesCard } from "./PodcastEpisodesCard"
import { TopicVideoSection } from "./TopicVideoSection"

// a season of seven films, newest first, so the list shows two pages
const films = Array.from({ length: 7 }, (_, index) => ({
	...PODCAST_STORY_FILM_EPISODE,
	id: `story-film-${index}`,
	episodeNumber: 7 - index,
	title: `${PODCAST_STORY_FILM_EPISODE.title} ${7 - index}`,
}))

// a topic with the topic video section on the latest film, and its owner's removal permission
const topic = toTestTopicResponse({
	latestPodcastEpisode: films[0],
	podcast: toTopicPodcastFixture({
		seasons: [2026, 2025],
		latestSeasonPodcastEpisodes: { podcastEpisodes: films },
		canRemovePodcastEpisodes: true,
		topicPodcastEpisodeVideoSection: { podcastEpisode: films[0] ?? PODCAST_STORY_FILM_EPISODE },
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

export const Films: Story = { render: () => <PodcastEpisodesCard topic={topic} format="video" /> }
export const FilmsWithTopicVideoSection: Story = {
	render: () => (
		<>
			<TopicVideoSection topic={topic} onVideoRenderingPoll={() => {}} />
			<PodcastEpisodesCard topic={topic} format="video" />
		</>
	),
}
export const PodcastEpisodes: Story = {
	render: () => <PodcastEpisodesCard topic={topic} onPodcastEpisodeRemoved={async () => {}} />,
}

// Both season lists stay usable while the preview server declines a removal.
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
			<PodcastEpisodesCard topic={topic} format="video" />
			<PodcastEpisodesCard topic={topic} onPodcastEpisodeRemoved={async () => {}} />
		</PodcastEpisodeRemovalProvider>
	),
}
