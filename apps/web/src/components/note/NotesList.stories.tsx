import { TEST_NOTES } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { NotesList } from "./NotesList"

// the table, a creator's invitation, a visitor's invitation, and a reader's empty line
const meta = {
	title: "Note/NotesList",
	component: NotesList,
	parameters: { surface: "card" },
	args: {
		notesResponse: { notes: TEST_NOTES, pageName: "Pour-over coffee", creatableVisibilities: ["private", "public"] },
		pageType: "topic",
		signUpHref: null,
		onOpenNote: fn(),
		onCreate: fn(),
	},
} satisfies Meta<typeof NotesList>
export default meta
type Story = StoryObj<typeof meta>
export const Notes: Story = {}
export const CreatorInvitation: Story = {
	args: { notesResponse: { notes: [], pageName: "Pour-over coffee", creatableVisibilities: ["private", "public"] } },
}
export const VisitorInvitation: Story = {
	args: {
		notesResponse: { notes: [], pageName: "Pour-over coffee", creatableVisibilities: [] },
		signUpHref: "/sign-up",
	},
}
export const ReaderEmpty: Story = {
	args: { notesResponse: { notes: [], pageName: "Pour-over coffee", creatableVisibilities: [] }, pageType: "team" },
}
