import { PodcastFeedDialog as SharedPodcastFeedDialog } from "@carlnotes/core/components/PodcastFeedDialog"
import { PODCAST_STORY_FEED_STATE as feed } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { podcastFeedDialogElements } from "./PodcastFeedDialog"

const meta: Meta<typeof SharedPodcastFeedDialog> = {
	title: "Podcast/PodcastFeedDialog",
	component: SharedPodcastFeedDialog,
	decorators: [
		(Story) => (
			<ScrollView>
				<Story />
			</ScrollView>
		),
	],
	args: {
		topicName: "The Devil's lightning podcast",
		feed,
		isOwnFeed: false,
		appLabel: "Open in Apple Podcasts",
		onOpenApp: () => {},
		onCopy: () => {},
		elements: podcastFeedDialogElements,
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Public: Story = {}
export const Private: Story = { args: { isOwnFeed: true } }
export const Loading: Story = { args: { feed: { ...feed, url: null, isLoading: true } } }
export const Unavailable: Story = { args: { feed: { ...feed, url: null } } }
export const ResetFailed: Story = {
	args: { isOwnFeed: true, feed: { ...feed, message: "The link did not change. Try again." } },
}
export const ResetConfirmation: Story = { args: { isOwnFeed: true, feed: { ...feed, isConfirmingReset: true } } }

// a Topic with a film offers Films, on the podcast feed and then on the film feed
const FILM_FEED = { ...feed, videoUrl: "https://example.test/podcast/fictional-video-feed.xml" }
export const WithFilms: Story = { args: { isOwnFeed: true, feed: FILM_FEED } }
export const FilmsChosen: Story = {
	args: { isOwnFeed: true, feed: { ...FILM_FEED, format: "video", chosenFeedUrl: FILM_FEED.videoUrl } },
}
