import type { Meta, StoryObj } from "@storybook/react-native"
import { STORY_TOPIC_PAGE } from "@/components/topic/topicPageStories"
import { TopicSettingsCard } from "./TopicSettingsCard"

// compare the same named web component at phone width
const meta: Meta<typeof TopicSettingsCard> = {
	title: "Topic/TopicSettingsCard",
	component: TopicSettingsCard,
	parameters: { webReference: "apps/web/src/components/topic/TopicSettingsCard.tsx at 375px", surface: "card" },
	args: { topic: STORY_TOPIC_PAGE },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
