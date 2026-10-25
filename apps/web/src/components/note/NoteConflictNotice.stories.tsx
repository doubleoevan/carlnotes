// the notice a lost save leaves above the note: who saved first, and the reload
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { NoteConflictNotice } from "./NoteConflictNotice"

const meta = {
	title: "Note/NoteConflictNotice",
	component: NoteConflictNotice,
	args: {
		lastEditorUsername: "vienna",
		isReloading: false,
		onReload: fn(),
	},
	argTypes: {
		lastEditorUsername: { control: "text" },
		isReloading: { control: "boolean" },
		onReload: { control: false },
	},
	parameters: { layout: "padded" },
} satisfies Meta<typeof NoteConflictNotice>

export default meta
type Story = StoryObj<typeof meta>

// a teammate saved first
export const Default: Story = {}

// the account that saved first has closed since
export const ClosedAccount: Story = {
	args: { lastEditorUsername: null },
}

// the reload is on its way
export const Reloading: Story = {
	args: { isReloading: true },
}
