// the Add to AI dialog: the AI providers Carl's mcp server installs in, the last one used first, and the copy option
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, screen } from "storybook/test"
import { LAST_AI_PROVIDER_KEY, storeAiProvider } from "@/lib/installDeeplinks"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { showMouseFocus } from "../../../.storybook/play"
import { AddToAiDialog } from "./AddToAiDialog"

const meta = {
	title: "Common/AddToAiDialog",
	component: AddToAiDialog,
	args: { mcpServer: { name: "CarlNotes", url: `${SITE_URL}/mcp` }, onClose: fn() },
	argTypes: {
		mcpServer: { control: "object" },
		onClose: { control: false },
	},
	// the open dialog renders in its own frame on the docs page, so two dialogs never stack
	parameters: { docs: toOwnFrameDocs(560) },
	// every story starts with no remembered AI provider, and the remembered one is cleared after
	beforeEach: () => {
		localStorage.removeItem(LAST_AI_PROVIDER_KEY)
		return () => localStorage.removeItem(LAST_AI_PROVIDER_KEY)
	},
	// the dialog as a mouse click on the menu's Add to AI option opens it, with no option filled
	play: showMouseFocus,
} satisfies Meta<typeof AddToAiDialog>

export default meta
type Story = StoryObj<typeof meta>

// the site-wide mcp server, with the AI providers in their default order
export const Default: Story = {}

// a topic's own mcp server, which the topic page opens the dialog with
export const TopicServer: Story = {
	args: { mcpServer: { name: "CarlNotes: LLM tooling", url: `${SITE_URL}/mcp/t/topic-llm-tooling` } },
}

// the Cursor option first, since the user installed through Cursor last time
export const LastProviderFirst: Story = {
	beforeEach: () => {
		storeAiProvider("cursor")
	},
}

// the Claude option open, with its paste steps, the server URL, and the Claude Code command
export const PasteStepsOpen: Story = {
	play: async ({ userEvent }) => {
		await showMouseFocus()
		await userEvent.click(await screen.findByRole("button", { name: "Claude" }))
		await expect(screen.getByRole("button", { name: "Copy Claude Code command" })).toBeVisible()
	},
}
