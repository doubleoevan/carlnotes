// the dialog primitive: a modal panel with a title, a description, a body, and a footer of actions
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type * as React from "react"
import { fn } from "storybook/test"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { showMouseFocus } from "../../../.storybook/play"
import { useSyncedArg } from "../../../.storybook/useSyncedArg"
import { Button } from "./button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./dialog"

// the root's props, and the content's choice to hide its ✕
type DialogStoryArgs = React.ComponentProps<typeof Dialog> &
	Pick<React.ComponentProps<typeof DialogContent>, "hideCloseButton">

const meta = {
	title: "Primitives/Dialog",
	component: Dialog,
	args: { open: true, modal: true, hideCloseButton: false, onOpenChange: fn() },
	argTypes: {
		open: { control: "boolean" },
		modal: { control: "boolean" },
		hideCloseButton: { control: "boolean" },
		onOpenChange: { control: false },
		children: { control: false },
	},
	// an open modal covers the page, so each story on the docs page gets its own frame
	parameters: { docs: toOwnFrameDocs(480) },
	render: toDialogRender(
		(closeDialog) => (
			<>
				<DialogTitle>Delete this topic?</DialogTitle>
				<DialogDescription>
					LLM tooling and its findings go away for you and the two people who follow it.
				</DialogDescription>
				{/* the cancel and the destructive confirm */}
				<DialogFooter>
					<Button variant="ghost" onClick={closeDialog}>
						Keep it
					</Button>
					<Button variant="destructive" onClick={closeDialog}>
						Delete topic
					</Button>
				</DialogFooter>
			</>
		),
		{ className: "sm:max-w-md" },
	),
} satisfies Meta<DialogStoryArgs>

export default meta
type Story = StoryObj<typeof meta>

// a confirmation, as the confirm dialog builds it, opened by a mouse click with no focus ring on the cancel button
export const Confirmation: Story = { play: showMouseFocus }

// a gate with no ✕, whose own actions are the only ways out, as the invite-only topic gate shows a visitor
export const WithoutCloseButton: Story = {
	args: { hideCloseButton: true },
	play: showMouseFocus,
	render: toDialogRender(
		(closeDialog) => (
			<>
				<DialogTitle>This topic is invite-only</DialogTitle>
				<DialogDescription>Sign up to see it.</DialogDescription>
				{/* the log in and the sign up */}
				<DialogFooter>
					<Button variant="outline" onClick={closeDialog}>
						Log in
					</Button>
					<Button onClick={closeDialog}>Sign up</Button>
				</DialogFooter>
			</>
		),
		{ className: "sm:max-w-md" },
	),
}

// a body taller than the screen, which scrolls inside the panel
export const LongContent: Story = {
	play: showMouseFocus,
	render: toDialogRender((closeDialog) => (
		<>
			<DialogTitle>What Carl reads</DialogTitle>
			<DialogDescription>Every source the LLM tooling topic reads, with what each one adds.</DialogDescription>
			{/* the long list of sources */}
			{LONG_SOURCE_LINES.map((sourceLine) => (
				<p key={sourceLine} className="text-sm">
					{sourceLine}
				</p>
			))}
			{/* the close action */}
			<DialogFooter>
				<Button onClick={closeDialog}>Done</Button>
			</DialogFooter>
		</>
	)),
}

// twenty invented source lines, enough to overflow the panel on any screen
const LONG_SOURCE_LINES = Array.from(
	{ length: 20 },
	(_, index) => `Source ${index + 1}: a feed at example.com with release notes, benchmarks, and long reads on tooling.`,
)

// a story render that holds the body in a dialog the open control drives, and a close sets the control back. the body
// gets a callback that closes the dialog, and the panel takes contentProps, such as its width class
function toDialogRender(
	renderBody: (closeDialog: () => void) => React.ReactNode,
	contentProps?: React.ComponentProps<typeof DialogContent>,
): (args: DialogStoryArgs) => React.JSX.Element {
	return function Render({ hideCloseButton, onOpenChange, ...args }) {
		// report the change and keep the open control in sync
		const handleOpenChange = useSyncedArg<DialogStoryArgs, "open">("open", onOpenChange)
		return (
			<Dialog {...args} onOpenChange={handleOpenChange}>
				<DialogContent {...contentProps} hideCloseButton={hideCloseButton}>
					{renderBody(() => handleOpenChange(false))}
				</DialogContent>
			</Dialog>
		)
	}
}
