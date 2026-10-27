import type { Meta, StoryObj } from "@storybook/react-native"
import { NoteConflictNotice } from "./NoteConflictNotice"

// compare the native adapter with its shared web content in both Nightshift themes
const meta: Meta<typeof NoteConflictNotice> = {
	title: "Note/NoteConflictNotice",
	component: NoteConflictNotice,
	args: { lastEditorUsername: "vienna", isReloading: false, onReload: () => {} },
	parameters: { webReference: "apps/web/src/components/note/NoteConflictNotice.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const ClosedAccount: Story = { args: { lastEditorUsername: null } }
export const Reloading: Story = { args: { isReloading: true } }
