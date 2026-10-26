import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicActionBar } from "./TopicPageActions"
import { STORY_TOPIC_PAGE } from "./topicPageStories"

// owner actions match the web and hand off unfinished workflows explicitly
const meta = {
	title: "Topic/TopicPageActions",
	component: TopicActionBar,
	args: { topic: STORY_TOPIC_PAGE },
	parameters: { webReference: "apps/web/src/components/topic/TopicActions.tsx at 375px" },
} satisfies Meta<typeof TopicActionBar>
export default meta
type Story = StoryObj<typeof meta>
export const Owner: Story = {}
export const Reader: Story = {
	args: { topic: { ...STORY_TOPIC_PAGE, isTopicOwner: false, manualScansRemaining: null } },
}
