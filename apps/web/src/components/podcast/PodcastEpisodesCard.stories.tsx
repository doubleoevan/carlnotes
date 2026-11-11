import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PodcastEpisodesCard } from "./PodcastEpisodesCard"
import { TopicPodcastEpisodeVideoSection } from "./TopicPodcastEpisodeVideoSection"

// a season of seven films, newest first, so the list shows two pages
const films = Array.from({ length: 7 }, (_, index) => ({
	...PODCAST_STORY_FILM_EPISODE,
	id: `story-film-${index}`,
	episodeNumber: 7 - index,
	title: `${PODCAST_STORY_FILM_EPISODE.title} ${7 - index}`,
}))

// a topic with Topic Cinema on the latest film, and its owner's removal permission
const topic = toTestTopicResponse({
	latestPodcastEpisode: films[0],
	podcast: {
		isEnabled: true,
		isCommentsEnabled: true,
		hasFullPodcastEpisodes: true,
		unpublishedPodcastEpisode: null,
		publicFeedUrl: null,
		seasons: [2026, 2025],
		latestSeasonPodcastEpisodes: { podcastEpisodes: films },
		canRemovePodcastEpisodes: true,
		topicPodcastEpisodeVideoSection: { podcastEpisode: films[0] ?? PODCAST_STORY_FILM_EPISODE, isOpen: true },
	},
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
export const FilmsWithTopicCinema: Story = {
	render: () => (
		<>
			<TopicPodcastEpisodeVideoSection topic={topic} onVideoRenderingPoll={() => {}} />
			<PodcastEpisodesCard topic={topic} format="video" />
		</>
	),
}
export const PodcastEpisodes: Story = {
	render: () => <PodcastEpisodesCard topic={topic} onPodcastEpisodeRemoved={async () => {}} />,
}
