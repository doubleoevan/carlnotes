// the toast host: the app's one Toaster, with buttons that raise a plain, an error, and a success toast
import { SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { toast } from "sonner"
import { fn } from "storybook/test"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { Button } from "./button"
import { Toaster } from "./sonner"

const meta = {
	title: "Primitives/Toaster",
	component: Toaster,
	args: { position: "top-center", richColors: true, closeButton: true, expand: false },
	argTypes: {
		position: {
			control: "select",
			options: ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"],
		},
		richColors: { control: "boolean" },
		closeButton: { control: "boolean" },
		expand: { control: "boolean" },
		duration: { control: "number" },
		theme: { control: false },
		toastOptions: { control: false },
	},
	parameters: {
		layout: "centered",
		// every Toaster shows every toast, so each story on the docs page gets its own frame, and the preview's own toast
		// host stays out so the story's host is the only one
		docs: toOwnFrameDocs(360),
		hasToaster: false,
	},
	// the host beside one button per kind of toast the app raises
	render: (args) => (
		<>
			<Toaster {...args} />
			<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
				<Button variant="outline" onClick={() => toast("Five attachments max per message.")}>
					Show a toast
				</Button>
				<Button variant="outline" onClick={() => toast.error("Carl couldn't start that note. Try again in a moment.")}>
					Show an error
				</Button>
				<Button variant="outline" onClick={() => toast.success("Invite link copied. Anyone holding it can follow.")}>
					Show a success
				</Button>
			</div>
		</>
	),
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

// the host with no toast yet, waiting on a button
export const Default: Story = {}

// all three toasts stacked at the top, raised by clicking each button
export const Stacked: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Show a toast" }))
		await userEvent.click(canvas.getByRole("button", { name: "Show an error" }))
		await userEvent.click(canvas.getByRole("button", { name: "Show a success" }))
	},
}

// the spent budget error with its See plans action, as the scan button raises it
export const WithAction: Story = {
	play: () => {
		toast.error(SCAN_SPENT_BUDGET_LABEL, { id: "spent-budget", action: { label: "See plans", onClick: fn() } })
	},
}
