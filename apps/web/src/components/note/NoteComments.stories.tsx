// the comment thread beside a note: the comments with their authors, the author's delete, and the composer
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { STORY_NOTE_COMMENTS } from "../../../.storybook/fixtures/notes"
import { NoteComments } from "./NoteComments"

const meta = {
	title: "Note/NoteComments",
	component: NoteComments,
	args: {
		comments: STORY_NOTE_COMMENTS,
		isLoading: false,
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
