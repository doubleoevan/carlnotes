// the mentions list: a full list with its Mark all seen, and the line an empty list shows
import { sendCommentMentionsSeen } from "@carlnotes/client/commentMentionClient"
import { COMMENT_MENTION_STORIES } from "@carlnotes/core/lib/commentMentionStories"
import { setCommentMentions } from "@carlnotes/core/stores/commentMentionStore"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked } from "storybook/test"
import { CommentMentionList } from "./CommentMentionList"

const meta = {
	title: "Social/CommentMentionList",
	component: CommentMentionList,
	args: { onChoose: fn() },
	// the list reads the store, which each story fills, and a seen mark reaches no api
	beforeEach: () => {
		setCommentMentions(COMMENT_MENTION_STORIES)
		mocked(sendCommentMentionsSeen).mockResolvedValue()
	},
	decorators: [
		(Story) => (
			<div className="bg-card w-80 rounded-lg border p-2">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof CommentMentionList>

export default meta
type Story = StoryObj<typeof meta>

// three mentions, newest first, each with its author, its first line, and its page
export const Full: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("RoastFan")).toBeVisible()
		await expect(canvas.getByText("Carl")).toBeVisible()
		await expect(canvas.getAllByText("Home espresso")).toHaveLength(2)
	},
}

// Mark all seen empties the list
export const MarkedAllSeen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Mark all seen" }))
		await expect(await canvas.findByText("No new mentions.")).toBeVisible()
	},
}

// a user with no unseen mention reads one line
export const Empty: Story = {
	beforeEach: () => {
		setCommentMentions([])
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("No new mentions.")).toBeVisible()
	},
}
