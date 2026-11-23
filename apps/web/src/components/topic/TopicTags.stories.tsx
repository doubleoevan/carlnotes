// a topic's tags in its header: a few tags, enough tags to wrap, and an untagged topic
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { TopicTags } from "./TopicTags"

const meta = {
	title: "Topic/TopicTags",
	component: TopicTags,
	args: { tags: ["coffee", "gear"] },
	decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof TopicTags>

export default meta
type Story = StoryObj<typeof meta>

// two tags on one line
export const Default: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("coffee")).toBeVisible()
		await expect(canvas.getByText("gear")).toBeVisible()
	},
}

// enough tags to wrap onto a second line from the left edge
export const Wrapping: Story = {
	args: { tags: ["ai-engineering", "technology", "jobs", "hiring", "go-to-market"] },
}

// an untagged topic shows no row
export const Untagged: Story = {
	args: { tags: [] },
	play: async ({ canvasElement }) => {
		await expect(canvasElement.textContent).toBe("")
	},
}
