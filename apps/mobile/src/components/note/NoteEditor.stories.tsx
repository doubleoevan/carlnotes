// compare the native adapter with its shared web content in both Nightshift themes
import { NOTE_FORMATS_HTML, toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import { toNoteBodySave } from "@carlnotes/core/hooks/useNoteBodySave"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { NoteEditor } from "./NoteEditor"
import { NOTE_STORY_THREAD } from "./noteStoryFixtures"

const meta: Meta<typeof NoteEditor> = {
	title: "Note/NoteEditor",
	component: NoteEditor,
	args: {
		note: toTestNote({ html: NOTE_FORMATS_HTML }),
		pageName: "Coffee",
		noteCommentThread: NOTE_STORY_THREAD,
		isCommentsOpen: false,
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
export const CommentsClosed: Story = {}
export const CommentsOpen: Story = { args: { isCommentsOpen: true } }
// save into a disposable controller so story typing never reaches an account
function EditorStory(props: React.ComponentProps<typeof NoteEditor>) {
	// retain editor and comments independently so opening a thread cannot discard body changes
	const [isCommentsOpen, setIsCommentsOpen] = useState(props.isCommentsOpen)
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
			<Button
				accessibilityLabel="Show comments"
				variant="outline"
				size="sm"
				className="mb-3 self-end"
				onPress={() => setIsCommentsOpen(true)}
			>
				<Text>Comments</Text>
			</Button>
			<NoteEditor
				{...props}
				controller={controller}
				isCommentsOpen={isCommentsOpen}
				onCloseComments={() => setIsCommentsOpen(false)}
			/>
		</View>
	)
}
