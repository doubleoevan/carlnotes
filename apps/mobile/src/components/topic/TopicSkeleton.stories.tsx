import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { TopicSkeleton } from "./TopicSkeleton"
import { STORY_TOPIC_PAGE } from "./topicPageStories"

// cover unknown deep links and the header already available from Home
const meta: Meta<typeof TopicSkeleton> = {
	title: "Topic/TopicSkeleton",
	component: TopicSkeleton,
	parameters: { webReference: "apps/web/src/components/topic/TopicSkeleton.tsx at 375px" },
	decorators: [
		(Story) => (
			<ScrollView className="w-full">
				<Story />
			</ScrollView>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const KnownTopic: Story = { args: { topicPreview: STORY_TOPIC_PAGE } }
export const WithoutPodcast: Story = {
	args: { topicPreview: { name: "Better coffee at home", latestPodcastEpisode: null } },
}
