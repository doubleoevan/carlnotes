// the confirmation dialog an action opens before it commits: a question, what the action does, and two buttons
import { CHAT_NAME } from "@carlnotes/contracts/chat"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, screen, waitFor } from "storybook/test"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { showMouseFocus } from "../../../.storybook/play"
import { ConfirmDialog } from "./ConfirmDialog"

const meta = {
	title: "Common/ConfirmDialog",
	component: ConfirmDialog,
	args: {
		title: "Delete this topic?",
		confirmLabel: "Delete topic",
		cancelLabel: "Keep it",
		children: "'LLM tooling' and its 42 findings and 6 scans go with it.",
		onConfirm: fn(),
		onClose: fn(),
	},
	argTypes: {
		title: { control: "text" },
		confirmLabel: { control: "text" },
		cancelLabel: { control: "text" },
		children: { control: "text" },
		onConfirm: { control: false },
		onClose: { control: false },
	},
	// the open dialog renders in its own frame on the docs page, so two dialogs never stack
	parameters: { docs: toOwnFrameDocs(320) },
	// the dialog as a mouse click opens it, with no focus ring on the cancel button
	play: showMouseFocus,
} satisfies Meta<typeof ConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

// deleting a topic, the most common confirmation
export const DeleteTopic: Story = {}

// leaving a team, with its own cancel label
export const LeaveTeam: Story = {
	args: {
		title: "Leave this team?",
		confirmLabel: "Leave team",
		cancelLabel: "Stay",
		children: `You lose access to Example Readers' topics and its ${CHAT_NAME}.`,
	},
}

// deleting a team, whose long body wraps across several lines
export const LongBody: Story = {
	args: {
		title: "Delete Example Readers?",
		confirmLabel: "Delete team",
		children:
			"Its 3 topics go back to whoever created them, and the room is deleted with the team. A team with other members survives without you instead, led by a co-leader or its longest-standing member.",
	},
}

// the confirm button, which calls onConfirm, with no focus ring after the click, as a mouse click leaves it
export const Confirmed: Story = {
	play: async ({ args, userEvent }) => {
		await userEvent.click(await screen.findByRole("button", { name: "Delete topic" }))
		await expect(args.onConfirm).toHaveBeenCalledOnce()
		await showMouseFocus()
	},
}

// a confirm press whose action is still running. every button is marked disabled but stays focusable, so the confirm
// button keeps its focus, the action is only sent once, and the keyboard keeps its place
export const Pending: Story = {
	args: { onConfirm: fn(() => new Promise<void>(() => {})) },
	play: async ({ args }) => {
		// focus the confirm button and press it, then press it again once it shows the pending state. a click needs no
		// window focus, which a docs page's sibling dialog frames take from each other
		const confirmButton = await screen.findByRole("button", { name: "Delete topic" })
		confirmButton.focus()
		confirmButton.click()
		await waitFor(() => expect(confirmButton).toHaveAttribute("aria-disabled", "true"))
		confirmButton.click()

		// both buttons are marked disabled, and the action ran once
		await expect(screen.getByRole("button", { name: "Keep it" })).toHaveAttribute("aria-disabled", "true")
		await expect(args.onConfirm).toHaveBeenCalledOnce()

		// the confirm button keeps the focus, checked where this frame holds the window's focus
		if (document.hasFocus()) {
			await expect(confirmButton).toHaveFocus()
		}
	},
}
