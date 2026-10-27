import { NOTE_FORMATS_HTML, toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { STORY_NOTE_COMMENTS } from "../../../.storybook/fixtures/notes"
import { NoteStatic } from "./NoteStatic"

// exercise the same format fixture as the native reader
const meta = {
	title: "Note/NoteStatic",
	component: NoteStatic,
	args: {
		note: toTestNote({ html: NOTE_FORMATS_HTML, canEdit: false }),
		isCommentsOpen: true,
		noteCommentThread: {
			comments: STORY_NOTE_COMMENTS,
			isLoading: false,
			hasError: false,
			retry: fn(),
			postNoteComment: fn(async () => true),
			deleteNoteComment: fn(async () => true),
		},
	},
	render: (args) => (
		<div className="flex h-[560px] flex-col">
			<NoteStatic {...args} />
		</div>
	),
} satisfies Meta<typeof NoteStatic>
export default meta
type Story = StoryObj<typeof meta>
export const EveryFormat: Story = {}
export const LongNote: Story = { args: { note: toTestNote({ html: NOTE_FORMATS_HTML.repeat(10), canEdit: false }) } }
export const CommentsClosed: Story = { args: { isCommentsOpen: false } }
