// a route's error: the reload prompt for a page file a deploy removed, and the router's own error for anything else
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { findVisibleByRole, findVisibleByText } from "../../.storybook/play"
import { RouteErrorPage } from "./RouteErrorPage"

const meta = {
	title: "Pages/RouteErrorPage",
	component: RouteErrorPage,
	args: {
		error: new TypeError(
			"Failed to fetch dynamically imported module: https://carlnotes.com/assets/profiles._userId_.specials.topics-DSZHiEWQ.js",
		),
		reset: () => {},
	},
} satisfies Meta<typeof RouteErrorPage>

export default meta
type Story = StoryObj<typeof meta>

// a tab on the earlier build asks for a page file the new build no longer has
export const StaleBundle: Story = {
	play: async () => {
		await findVisibleByText("A fresh batch of CarlNotes is ready.")
		await expect(await findVisibleByRole("button", { name: "Pour" })).toBeEnabled()
	},
}

// any other error keeps the router's own error
export const OtherError: Story = {
	args: { error: new Error("Network request failed") },
	play: async () => {
		await findVisibleByText("Something went wrong!")
	},
}
