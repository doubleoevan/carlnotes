import { TAKEAWAY_STORY_TEXT } from "@carlnotes/core/lib/topicMemoryStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TakeawayRow, TakeawaySkeleton, TakeawaysList } from "./takeaways-list"

const meta: Meta<typeof TakeawaysList> = {
	title: "Primitives/TakeawaysList",
	component: TakeawaysList,
	parameters: { webReference: "Primitives/TakeawaysList at 375px" },
	args: { isLoading: false, children: <TakeawayRow itemNumber={1} isLast text={TAKEAWAY_STORY_TEXT} /> },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = {
	args: {
		isLoading: true,
		children: <TakeawaySkeleton itemNumber={1} isLast text={TAKEAWAY_STORY_TEXT.repeat(4)} canRate />,
	},
}
