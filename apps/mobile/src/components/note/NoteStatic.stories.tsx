// compare the native adapter with its shared web content in both Nightshift themes
import { NOTE_FORMATS_HTML, toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { NoteStatic } from "./NoteStatic"
import { NOTE_STORY_THREAD } from "./noteStoryFixtures"

const meta: Meta<typeof NoteStatic> = {
	title: "Note/NoteStatic",
	component: NoteStatic,
	args: {
		note: toTestNote({ html: NOTE_FORMATS_HTML, canEdit: false }),
		noteCommentThread: NOTE_STORY_THREAD,
		isCommentsOpen: true,
	},
	decorators: [
		(Story) => (
			<View style={{ height: 600 }}>
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/components/note/NoteStatic.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const EveryFormat: Story = {}
export const LongNote: Story = { args: { note: toTestNote({ html: NOTE_FORMATS_HTML.repeat(10), canEdit: false }) } }
