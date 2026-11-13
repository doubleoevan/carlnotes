// a topic list with no topics: the standard empty card, whose one line opens the new topic chat

import { EMPTY_TOPIC_SECTION } from "@carlnotes/core/lib/topicFeedLabels"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn } from "storybook/test"
import { NewTopicEmptyCard } from "./NewTopicEmptyCard"

const meta = {
	title: "Topic/NewTopicEmptyCard",
	component: NewTopicEmptyCard,
	parameters: { surface: "page" },
	args: { onNewTopicChat: fn() },
} satisfies Meta<typeof NewTopicEmptyCard>
export default meta
type Story = StoryObj<typeof meta>

// the line is a body-text link, and a press opens the new topic chat
export const Default: Story = {
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: EMPTY_TOPIC_SECTION }))
		await expect(args.onNewTopicChat).toHaveBeenCalledOnce()
	},
}
