import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import {
	PODCAST_STORY_EPISODE,
	PODCAST_STORY_FILM_EPISODE,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicPodcastEpisodeVideoSection } from "./TopicPodcastEpisodeVideoSection"

// a topic whose Topic Cinema opens or stays collapsed on the latest film
function toFilmTopic(isOpen: boolean): ReturnType<typeof toTestTopicResponse> {
	return toTestTopicResponse({
		podcast: {
			isEnabled: true,
			isCommentsEnabled: true,
			hasFullPodcastEpisodes: true,
			unpublishedPodcastEpisode: null,
			publicFeedUrl: null,
			seasons: [2026],
			latestSeasonPodcastEpisodes: { podcastEpisodes: [PODCAST_STORY_FILM_EPISODE] },
			canRemovePodcastEpisodes: false,
			topicPodcastEpisodeVideoSection: { podcastEpisode: PODCAST_STORY_FILM_EPISODE, isOpen },
		},
	})
}

// a topic with no ready film, whose latest podcast episode's film is rendering
const VIDEO_RENDERING_TOPIC = toTestTopicResponse({
	podcast: {
		isEnabled: true,
		isCommentsEnabled: true,
		hasFullPodcastEpisodes: true,
		unpublishedPodcastEpisode: null,
		publicFeedUrl: null,
		seasons: [2026],
		latestSeasonPodcastEpisodes: { podcastEpisodes: [PODCAST_STORY_EPISODE] },
		canRemovePodcastEpisodes: false,
		topicPodcastEpisodeVideoSection: null,
	},
	latestPodcastEpisode: { ...PODCAST_STORY_EPISODE, isVideoRendering: true },
})

const meta: Meta<typeof TopicPodcastEpisodeVideoSection> = {
	title: "Podcast/TopicPodcastEpisodeVideoSection",
	component: TopicPodcastEpisodeVideoSection,
	args: { topic: toFilmTopic(true), onVideoRenderingPoll: () => {} },
	parameters: { webReference: "apps/web/src/components/podcast/TopicPodcastEpisodeVideoSection.tsx at 375px" },
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
type Story = StoryObj<typeof meta>

export const Open: Story = {}
export const Collapsed: Story = { args: { topic: toFilmTopic(false) } }
export const VideoRendering: Story = { args: { topic: VIDEO_RENDERING_TOPIC } }
