import { sendImportConversations } from "@carlnotes/client/personalSourcesClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, userEvent, within } from "storybook/test"
import { PersonalSourcesImportDialog } from "./PersonalSourcesImportDialog"

// parse fictional input in the real disposable worker while keeping uploads local to the story mock
const meta = {
	title: "Topic/PersonalSourcesImportDialog",
	component: PersonalSourcesImportDialog,
	args: { topicId: "topic-example", onClose: fn(), onImported: fn(async () => {}) },
} satisfies Meta<typeof PersonalSourcesImportDialog>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const SelectedPaste: Story = {
	play: async ({ canvasElement }) => {
		// pasted text must pass the same explicit selection as exported conversations
		const dialog = within(canvasElement.ownerDocument.body)
		await userEvent.type(dialog.getByLabelText("Pasted conversation title"), "Local model research")
		await userEvent.type(dialog.getByLabelText("Pasted conversation text"), "Reader: Compare latency and energy use.")
		await userEvent.click(dialog.getByRole("button", { name: "Preview pasted text" }))
		const checkbox = await dialog.findByRole("checkbox")
		await expect(checkbox).not.toBeChecked()
		await expect(dialog.getByRole("button", { name: "Import 0 selected conversations" })).toBeDisabled()
		await userEvent.click(checkbox)
		await expect(dialog.getByRole("button", { name: "Import 1 selected conversations" })).toBeEnabled()
		await expect(mocked(sendImportConversations)).not.toHaveBeenCalled()
	},
}
