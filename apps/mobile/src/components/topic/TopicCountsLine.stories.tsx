import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicCountsLine } from "./TopicCountsLine"
import { STORY_TOPIC_PAGE, TopicPageStoryProvider } from "./topicPageStories"

// show delivered counts without polling from Storybook
const meta: Meta<typeof TopicCountsLine> = {
	title: "Topic/TopicCountsLine",
	component: TopicCountsLine,
	parameters: { webReference: "apps/web/src/components/topic/TopicCountsLine.tsx" },
	args: { topic: STORY_TOPIC_PAGE },
	decorators: [
		(Story) => (
			<TopicPageStoryProvider>
				<Story />
			</TopicPageStoryProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
