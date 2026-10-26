import type { Meta, StoryObj } from "@storybook/react-native"
import { STORY_PODCAST_EPISODE } from "@/components/topic/topicPageStories"
import { FindingChapterPill, PodcastEpisodeNumberPill } from "./PodcastEpisodePill"

// episode and chapter pills share the web's presentation and native player handoff
const meta = {
	title: "Podcast/PodcastEpisodePill",
	component: PodcastEpisodeNumberPill,
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodePill.tsx" },
	args: { podcastEpisode: STORY_PODCAST_EPISODE },
} satisfies Meta<typeof PodcastEpisodeNumberPill>
export default meta
type Story = StoryObj<typeof meta>
export const Episode: Story = {}
export const Chapter: Story = {
	render: () => <FindingChapterPill podcastEpisode={STORY_PODCAST_EPISODE} findingId="coffee-0" />,
}
