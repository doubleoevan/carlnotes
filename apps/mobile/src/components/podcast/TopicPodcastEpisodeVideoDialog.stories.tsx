import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicPodcastEpisodeVideoDialog } from "./TopicPodcastEpisodeVideoDialog"

// the sheet reads the podcast episode from the configured api, so a fixture id shows the failure line
const meta: Meta<typeof TopicPodcastEpisodeVideoDialog> = {
	title: "Podcast/TopicPodcastEpisodeVideoDialog",
	component: TopicPodcastEpisodeVideoDialog,
	args: {
		podcastEpisodeId: PODCAST_STORY_FILM_EPISODE.id,
		title: PODCAST_STORY_FILM_EPISODE.title ?? "",
		onClose: () => {},
	},
	parameters: { webReference: "apps/web/src/components/podcast/TopicPodcastEpisodeVideoDialog.tsx at 375px" },
	decorators: [
		(Story) => (
			<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
				<Story />
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
