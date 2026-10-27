import type { Meta, StoryObj } from "@storybook/react-native"
import { NoteVisibilitySelect } from "./NoteVisibilitySelect"

// compare the native adapter with its shared web content in both Nightshift themes
const meta: Meta<typeof NoteVisibilitySelect> = {
	title: "Note/NoteVisibilitySelect",
	component: NoteVisibilitySelect,
	args: { visibilities: ["private", "team", "public"], visibility: "team", onNoteVisibilityChange: () => {} },
	parameters: { webReference: "apps/web/src/components/note/NoteVisibilitySelect.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const ReadOnly: Story = { args: { visibilities: ["public"], visibility: "public" } }
