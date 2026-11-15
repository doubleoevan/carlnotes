import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicVideoDialog } from "./TopicVideoDialog"

// the sheet reads the podcast episode from the configured api, so a fixture id shows the failure line
const meta: Meta<typeof TopicVideoDialog> = {
	title: "Podcast/TopicVideoDialog",
	component: TopicVideoDialog,
	args: {
		podcastEpisodeId: PODCAST_STORY_FILM_EPISODE.id,
		title: PODCAST_STORY_FILM_EPISODE.title ?? "",
		onClose: () => {},
	},
	parameters: { webReference: "apps/web/src/components/podcast/TopicVideoDialog.tsx at 375px" },
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
