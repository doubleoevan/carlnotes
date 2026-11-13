import { TEST_NOTES } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { NoteDetails } from "./NoteDetails"
import { NoteVisibilitySelect } from "./NoteVisibilitySelect"

// a reader's frame, then the owner's with the visibility select, as the web's stories show them
const meta: Meta<typeof NoteDetails> = {
	title: "Note/NoteDetails",
	component: NoteDetails,
	parameters: { surface: "card", webReference: "apps/web/src/components/note/NoteDetails.tsx at 375px" },
	args: {
		note: TEST_NOTES[1] ?? { name: "Tasting Note", owner: null },
		visibility: null,
		isCommentsOpen: false,
		onToggleComments: () => undefined,
	},
}
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
				onNoteVisibilityChange={() => undefined}
			/>
		),
	},
}
