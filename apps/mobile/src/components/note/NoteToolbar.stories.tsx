import type { Meta, StoryObj } from "@storybook/react-native"
import { NoteToolbar } from "./NoteToolbar"

// compare the native adapter with its shared web content in both Nightshift themes
const meta: Meta<typeof NoteToolbar> = {
	title: "Note/NoteToolbar",
	component: NoteToolbar,
	args: { editorRef: { current: null }, selection: { start: 0, end: 0, text: "" }, activeLink: null, formatState: {} },
	parameters: { webReference: "apps/web/src/components/note/NoteToolbar.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Active: Story = {
	args: { formatState: { bold: { isActive: true, isBlocking: false }, h1: { isActive: true, isBlocking: false } } },
}
export const Blocked: Story = {
	args: { formatState: { bold: { isActive: false, isBlocking: true }, h1: { isActive: false, isBlocking: true } } },
}
export const MultilineSelection: Story = { args: { selection: { start: 0, end: 9, text: "one\ntwo" } } }
