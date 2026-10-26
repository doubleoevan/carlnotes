import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { TopicFeedSkeleton } from "./TopicFeedSkeleton"

// compare the loading shapes with Home's first expanded section
const meta: Meta<typeof TopicFeedSkeleton> = {
	title: "Topic/TopicFeedSkeleton",
	component: TopicFeedSkeleton,
	parameters: { webReference: "apps/web/src/components/topic/TopicFeedSkeleton.tsx at 375px" },
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
