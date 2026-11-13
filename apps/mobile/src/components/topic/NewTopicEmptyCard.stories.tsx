import type { Meta, StoryObj } from "@storybook/react-native"
import { NewTopicEmptyCard } from "./NewTopicEmptyCard"

// a topic list with no topics: the standard empty card, whose one line opens the New Topic dialog
const meta = {
	title: "Topic/NewTopicEmptyCard",
	component: NewTopicEmptyCard,
	parameters: { webReference: "apps/web/src/components/topic/NewTopicEmptyCard.tsx" },
} satisfies Meta<typeof NewTopicEmptyCard>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
