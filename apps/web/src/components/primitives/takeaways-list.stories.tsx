import { TAKEAWAY_STORY_TEXT } from "@carlnotes/core/lib/topicMemoryStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TakeawayRow, TakeawaySkeleton, TakeawaysList } from "./takeaways-list"

const meta = {
	title: "Primitives/TakeawaysList",
	component: TakeawaysList,
	args: { isLoading: false, children: <TakeawayRow itemNumber={1} isLast text={TAKEAWAY_STORY_TEXT} /> },
} satisfies Meta<typeof TakeawaysList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = {
	args: {
		isLoading: true,
		children: <TakeawaySkeleton itemNumber={1} isLast text={TAKEAWAY_STORY_TEXT.repeat(4)} canRate />,
	},
}
