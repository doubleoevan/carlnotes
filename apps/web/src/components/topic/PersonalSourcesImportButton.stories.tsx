import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { PersonalSourcesImportButton } from "./PersonalSourcesImportButton"

// both platforms use the shared opener and disable it while receiving is unavailable
const meta = {
	title: "Topic/PersonalSourcesImportButton",
	component: PersonalSourcesImportButton,
	args: { topicId: "topic-example", onImported: fn(async () => {}), isDisabled: false },
} satisfies Meta<typeof PersonalSourcesImportButton>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {
	play: async ({ canvasElement }) => {
		// exercise the real opener and close without uploading or retaining text
		const body = within(canvasElement.ownerDocument.body)
		await userEvent.click(body.getByRole("button", { name: "Import conversations" }))
		await waitFor(() => expect(body.getByRole("dialog")).toBeVisible())
		await userEvent.click(body.getByRole("button", { name: "Cancel" }))
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument())
	},
}
export const Disabled: Story = { args: { isDisabled: true } }
