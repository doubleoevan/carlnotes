// compare the native adapter with its shared web content in both Nightshift themes
import { NOTE_FORMATS_HTML, toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import { toNoteBodySave } from "@carlnotes/core/hooks/useNoteBodySave"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { NoteEditor } from "./NoteEditor"
import { NOTE_STORY_THREAD } from "./noteStoryFixtures"

const meta: Meta<typeof NoteEditor> = {
	title: "Note/NoteEditor",
	component: NoteEditor,
	args: {
		note: toTestNote({ html: NOTE_FORMATS_HTML }),
		pageName: "Coffee",
		noteCommentThread: NOTE_STORY_THREAD,
		isCommentsOpen: true,
		onSaveStatus: () => {},
		onSaveError: () => {},
	},
	render: (args) => <EditorStory {...args} />,
	parameters: { webReference: "apps/web/src/components/note/NoteEditor.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const EveryFormat: Story = {}
export const LongNote: Story = { args: { note: toTestNote({ html: NOTE_FORMATS_HTML.repeat(10) }) } }
// save into a disposable controller so story typing never reaches an account
function EditorStory(props: React.ComponentProps<typeof NoteEditor>) {
	const [controller] = useState(() =>
		toNoteBodySave({
			noteId: props.note.id,
			html: props.note.html,
			version: props.note.version,
			onSaveError: () => {},
			saveBody: async (_id, body) => ({ status: "saved", version: body.version + 1 }),
		}),
	)
	return (
		<View style={{ height: 600 }}>
			<NoteEditor {...props} controller={controller} />
		</View>
	)
}
