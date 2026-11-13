import { TEST_NOTES } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { NoteDetails } from "./NoteDetails"
import { NoteVisibilitySelect } from "./NoteVisibilitySelect"

// a reader's frame, then the owner's with the visibility select, and the frame with the comments open
const meta = {
	title: "Note/NoteDetails",
	component: NoteDetails,
	parameters: { surface: "card" },
	args: {
		note: TEST_NOTES[1] ?? { name: "Tasting Note", owner: null },
		visibility: null,
		isCommentsOpen: false,
		onToggleComments: fn(),
	},
} satisfies Meta<typeof NoteDetails>
export default meta
type Story = StoryObj<typeof meta>
export const Reader: Story = {}
export const Owner: Story = {
	args: {
		note: TEST_NOTES[0] ?? { name: "Tasting Note", owner: null },
		visibility: (
			<NoteVisibilitySelect
				visibilities={["private", "team", "public"]}
				visibility="private"
				onNoteVisibilityChange={fn()}
			/>
		),
	},
}
export const CommentsOpen: Story = { args: { isCommentsOpen: true } }
