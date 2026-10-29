import {
	PODCAST_STORY_CHAPTER_TAG,
	PODCAST_STORY_LONG_CHAPTER_NOTE,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PodcastEpisodeChapterTag } from "./PodcastEpisodeChapterTag"

// use loaded fictional audio so a preview tap never fetches or records a listen
const meta: Meta<typeof PodcastEpisodeChapterTag> = {
	title: "Chat/PodcastEpisodeChapterTag",
	component: PodcastEpisodeChapterTag,
	args: PODCAST_STORY_CHAPTER_TAG,
	parameters: { webReference: "apps/web/src/components/chat/PodcastEpisodeChapterTag.tsx at 375px" },
	decorators: [
		(Story) => (
			<PodcastEpisodeStory state="paused">
				<Story />
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const LongTitle: Story = { args: { podcastEpisodeNote: PODCAST_STORY_LONG_CHAPTER_NOTE } }
