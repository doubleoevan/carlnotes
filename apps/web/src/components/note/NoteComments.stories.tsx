// the comment thread beside a note: the comments with their authors, the author's delete, and the composer
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, userEvent, within } from "storybook/test"
import { STORY_NOTE_COMMENTS } from "../../../.storybook/fixtures/notes"
import { NoteComments } from "./NoteComments"

const meta = {
	title: "Note/NoteComments",
	component: NoteComments,
	args: {
		comments: STORY_NOTE_COMMENTS,
		isLoading: false,
		hasError: false,
		retry: fn(),
		canComment: true,
		postNoteComment: fn(async () => true),
		deleteNoteComment: fn(async () => true),
	},
	argTypes: {
		isLoading: { control: "boolean" },
		canComment: { control: "boolean" },
		comments: { control: false },
		postNoteComment: { control: false },
		deleteNoteComment: { control: false },
	},
	parameters: { layout: "padded" },
	// the thread at the width of the margin column beside a note
	decorators: [
		(Story) => (
			<div className="w-64">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof NoteComments>

export default meta
type Story = StoryObj<typeof meta>

// the thread for a user who may write the note, composer included
export const Thread: Story = {}

// cancellation leaves the comment alone and only explicit confirmation reaches deletion
export const DeleteConfirmation: Story = {
	args: { deleteNoteComment: fn(async () => true) },
	play: async ({ canvas, canvasElement, args }) => {
		const page = within(canvasElement.ownerDocument.body)
		await userEvent.click(canvas.getByRole("button", { name: "Delete comment" }))
		const confirmation = within(await page.findByRole("dialog", { name: "Delete this comment?" }))
		await expect(args.deleteNoteComment).not.toHaveBeenCalled()
		await userEvent.click(confirmation.getByRole("button", { name: "Keep it" }))
		await expect(args.deleteNoteComment).not.toHaveBeenCalled()
		await expect(canvas.getByText("Dropped it. Have a look.")).toBeInTheDocument()

		// a second opening still requires a deliberate destructive action
		await userEvent.click(canvas.getByRole("button", { name: "Delete comment" }))
		const reopenedConfirmation = within(await page.findByRole("dialog", { name: "Delete this comment?" }))
		await userEvent.click(reopenedConfirmation.getByRole("button", { name: "Delete comment" }))
		await expect(args.deleteNoteComment).toHaveBeenCalledOnce()
		await expect(args.deleteNoteComment).toHaveBeenCalledWith("comment-3")
	},
}

// the thread for a user without edit access: the comments alone
export const ReadOnly: Story = {
	args: { canComment: false },
}

// a note nobody has commented on yet
export const Empty: Story = {
	args: { comments: [] },
}

// the thread before it arrives
export const Loading: Story = {
	args: { comments: [], isLoading: true },
}

// a failed load offers retry without claiming that the note has no comments
export const Failed: Story = {
	args: { comments: [], hasError: true },
	play: async ({ canvas, args }) => {
		// request another load without closing the note
		await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
		await expect(args.retry).toHaveBeenCalledOnce()
		await expect(canvas.queryByText("No comments yet.")).not.toBeInTheDocument()
	},
}
