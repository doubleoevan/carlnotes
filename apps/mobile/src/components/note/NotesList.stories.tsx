import { TEST_NOTES } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { NotesList } from "./NotesList"

// the table, the invitation, and a reader's empty line, as the web's stories show them
const meta: Meta<typeof NotesList> = {
	title: "Note/NotesList",
	component: NotesList,
	parameters: { surface: "card", webReference: "apps/web/src/components/note/NotesList.tsx at 375px" },
	args: {
		notesResponse: { notes: TEST_NOTES, pageName: "Pour-over coffee", creatableVisibilities: ["private", "public"] },
		pageType: "topic",
		canCreate: true,
		path: "/topics/coffee",
		onAdd: () => undefined,
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Notes: Story = {}
export const CreatorInvitation: Story = {
	args: { notesResponse: { notes: [], pageName: "Pour-over coffee", creatableVisibilities: ["private", "public"] } },
}
export const ReaderEmpty: Story = {
	args: {
		notesResponse: { notes: [], pageName: "Pour-over coffee", creatableVisibilities: [] },
		pageType: "team",
		canCreate: false,
	},
}
