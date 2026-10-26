import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Topic } from "./Topic"

// match the complete web Topic header without account mutations
const meta = {
	title: "Topic/Topic",
	component: Topic,
	parameters: { webReference: "apps/web/src/components/topic/Topic.tsx at 375px" },
	args: {
		topic: toTestTopicFeed({
			newCount: 20,
			owner: { userId: "coffee", username: "CoffeeReader", avatarSource: "generated", avatarVersion: null },
		}),
	},
} satisfies Meta<typeof Topic>
export default meta
type Story = StoryObj<typeof meta>
export const Owner: Story = {}
export const Team: Story = {
	args: {
		topic: toTestTopicFeed({
			newCount: 20,
			teamLink: { teamId: "coffee", name: "Coffee's for Closers", avatarVersion: null },
			tags: ["technology", "ai-engineering"],
		}),
	},
}
export const Untagged: Story = { args: { topic: toTestTopicFeed({ tags: [] }) } }
