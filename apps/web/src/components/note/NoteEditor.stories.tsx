// the note editor as a user with edit access opens it: the toolbar, the body on the page card, the thread beside it,
// and the notice a save that lost to a newer version leaves
import { fetchNote, saveNoteBody } from "@carlnotes/client/noteClient"
import type { NoteResponse } from "@carlnotes/contracts/notes"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { STORY_NOTE_COMMENTS } from "../../../.storybook/fixtures/notes"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { NoteEditor } from "./NoteEditor"

// the note as the dialog opens it: every construct the toolbar offers, at version 3
const STORY_NOTE: NoteResponse = {
	id: "note-eval-checklist",
	name: "Eval checklist",
	visibility: "team",
	createdAt: "2026-09-20T10:00:00.000Z",
	updatedAt: "2026-09-30T08:05:00.000Z",
	canEdit: true,
	isNoteOwner: true,
	canDelete: true,
	version: 3,
	html:
		'<h1>Eval checklist</h1><p>What we <b>keep</b>, what we <i>drop</i>, and <a href="https://carlnotes.com">why</a>.</p>' +
		'<ul data-type="checkbox"><li checked>Trace every run</li><li>Compare graders</li></ul>' +
		"<blockquote><p>The runner that explains itself wins.</p></blockquote><codeblock><p>bun run eval:review-pipeline</p></codeblock>",
}

// a save the api keeps, and the note read back on a reload
function mockSavedNote(): void {
	mocked(saveNoteBody).mockResolvedValue({ status: "saved", version: 4 })
	mocked(fetchNote).mockResolvedValue(STORY_NOTE)
}

const meta = {
	title: "Note/NoteEditor",
	component: NoteEditor,
	args: {
		note: STORY_NOTE,
		pageName: "LLM tooling",
		noteCommentThread: {
			comments: STORY_NOTE_COMMENTS,
			isLoading: false,
			hasError: false,
			retry: fn(),
			postNoteComment: fn(async () => true),
			deleteNoteComment: fn(async () => true),
		},
		isCommentsOpen: true,
		onSaveStatus: fn(),
		onSaveError: fn(),
	},
	argTypes: {
		isCommentsOpen: { control: "boolean" },
		note: { control: false },
		noteCommentThread: { control: false },
		onSaveStatus: { control: false },
		onSaveError: { control: false },
	},
	beforeEach: mockSavedNote,
	// the editor fills the dialog's height, so the story gives it one
	render: (args) => (
		<div className="flex h-[560px] flex-col">
			<NoteEditor {...args} />
		</div>
	),
	parameters: { layout: "padded", docs: toOwnFrameDocs(640) },
} satisfies Meta<typeof NoteEditor>

export default meta
type Story = StoryObj<typeof meta>

// the note open for editing, with the thread beside it
export const Editing: Story = {}

// the note on a phone, where the thread stays closed until asked for
export const CommentsClosed: Story = {
	args: { isCommentsOpen: false },
}

// a save that lost to a newer version: a keystroke schedules a save, the api returns a conflict, and the notice shows
export const Conflict: Story = {
	beforeEach: () => {
		mocked(saveNoteBody).mockResolvedValue({ status: "conflict", version: 5, lastEditorUsername: "vienna" })
	},
	play: async ({ canvasElement }) => {
		// type into the editor once it has mounted
		const editorElement = await waitFor(() => {
			const element = canvasElement.querySelector(".ProseMirror")
			expect(element).not.toBeNull()
			return element as HTMLElement
		})
		await userEvent.click(editorElement)
		await userEvent.keyboard(" and more")

		// the notice names who saved last
		await waitFor(() => expect(within(canvasElement).getByRole("alert")).toHaveTextContent("@vienna"), {
			timeout: 4000,
		})
	},
}
