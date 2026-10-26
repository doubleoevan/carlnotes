import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { STORY_PODCAST_EPISODE, STORY_TOPIC_PAGE, TopicPageStoryProvider } from "@/components/topic/topicPageStories"
import { TopicScanHistory } from "./TopicScanHistory"

// the complete fixture exercises the matching web card without account requests
const meta: Meta<typeof TopicScanHistory> = {
	title: "Topic/TopicScanHistory",
	component: TopicScanHistory,
	parameters: { webReference: "apps/web/src/components/topic/TopicScanHistory.tsx at 375px" },
	args: { topic: STORY_TOPIC_PAGE },
	decorators: [
		(Story) => (
			<TopicPageStoryProvider>
				<ScrollView className="w-full">
					<Story />
				</ScrollView>
			</TopicPageStoryProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const WithPodcastEpisode: Story = {
	args: {
		topic: {
			...STORY_TOPIC_PAGE,
			scans: STORY_TOPIC_PAGE.scans.map((scan) => ({
				...scan,
				podcastEpisode: { ...STORY_PODCAST_EPISODE, season: 2026, episodeNumber: 1 },
			})),
		},
	},
}
export const Failed: Story = {
	args: {
		topic: {
			...STORY_TOPIC_PAGE,
			scans: STORY_TOPIC_PAGE.scans.map((scan) => ({
				...scan,
				status: "failed",
				error: "This brew could not finish.",
			})),
		},
	},
}
export const Running: Story = {
	args: {
		topic: {
			...STORY_TOPIC_PAGE,
			scans: STORY_TOPIC_PAGE.scans.map((scan) => ({ ...scan, status: "running", finishedAt: null })),
		},
	},
}
export const Empty: Story = { args: { topic: { ...STORY_TOPIC_PAGE, scans: [] } } }
