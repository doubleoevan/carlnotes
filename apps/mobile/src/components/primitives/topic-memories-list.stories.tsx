import { TOPIC_MEMORY_STORY_TEXT } from "@carlnotes/core/lib/topicMemoryStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicMemoriesList, TopicMemoryRow, TopicMemorySkeleton } from "./topic-memories-list"

const meta: Meta<typeof TopicMemoriesList> = {
	title: "Primitives/TopicMemoriesList",
	component: TopicMemoriesList,
	parameters: { webReference: "Primitives/TopicMemoriesList at 375px" },
	args: { isLoading: false, children: <TopicMemoryRow itemNumber={1} isLast text={TOPIC_MEMORY_STORY_TEXT} /> },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = {
	args: {
		isLoading: true,
		children: <TopicMemorySkeleton itemNumber={1} isLast text={TOPIC_MEMORY_STORY_TEXT.repeat(4)} canRate />,
	},
}
