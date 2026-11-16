import { TOPIC_MEMORY_STORY_TEXT } from "@carlnotes/core/lib/topicMemoryStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicMemoriesList, TopicMemoryRow, TopicMemorySkeleton } from "./topic-memories-list"

const meta = {
	title: "Primitives/TopicMemoriesList",
	component: TopicMemoriesList,
	args: { isLoading: false, children: <TopicMemoryRow itemNumber={1} isLast text={TOPIC_MEMORY_STORY_TEXT} /> },
} satisfies Meta<typeof TopicMemoriesList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = {
	args: {
		isLoading: true,
		children: <TopicMemorySkeleton itemNumber={1} isLast text={TOPIC_MEMORY_STORY_TEXT.repeat(4)} canRate />,
	},
}
