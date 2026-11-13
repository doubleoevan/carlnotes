// a table's delete confirmation: its target linked to the target's page, or in bold where the target has no page
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { TableConfirmDialog } from "./TableConfirmDialog"

const meta = {
	title: "Table/TableConfirmDialog",
	component: TableConfirmDialog,
	args: {
		title: "Withdraw this invite?",
		confirmLabel: "Withdraw invite",
		cancelLabel: "Keep it",
		body: { beforeTarget: "", target: "Pour-over coffee", afterTarget: " loses this invite.", targetHref: "/topics/1" },
		onConfirm: fn(async () => undefined),
		onClose: fn(),
	},
	// the open dialog renders in its own frame on the docs page, so two dialogs never stack
	parameters: { docs: toOwnFrameDocs(320) },
} satisfies Meta<typeof TableConfirmDialog>
export default meta
type Story = StoryObj<typeof meta>
export const LinkedTarget: Story = {}
export const BoldTarget: Story = {
	args: { body: { beforeTarget: "", target: "mira@example.com", afterTarget: " loses this invite." } },
}
