// the admin's home order list: a topic joining the list, a podcast episode already in it, and a pinned row removed after a confirmation
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, screen, within } from "storybook/test"
import { HomeRankDialog } from "./HomeRankDialog"

// three home topics, and the page's topic, not among them
const HOME_TOPICS = [
	{ id: "topic-llm-tooling", label: "LLM tooling" },
	{ id: "topic-home-espresso", label: "Home espresso" },
	{ id: "topic-city-cycling", label: "City cycling" },
]
const PAGE_TOPIC = { id: "topic-sourdough", label: "Sourdough" }

const meta = {
	title: "Common/HomeRankDialog",
	component: HomeRankDialog,
	args: {
		noun: "topics",
		pageItem: PAGE_TOPIC,
		homeItems: HOME_TOPICS,
		isPageItemOnHome: false,
		onSave: fn(async () => {}),
		onClose: fn(),
	},
	argTypes: { pageItem: { control: false }, homeItems: { control: false } },
	parameters: { session: "admin" },
} satisfies Meta<typeof HomeRankDialog>

export default meta
type Story = StoryObj<typeof meta>

// the page's topic appended at the end, with the check on its row, and Save disabled until something moves
export const Default: Story = {
	play: async () => {
		const dialog = within(await screen.findByRole("dialog"))
		await expect(dialog.getByRole("button", { name: "4 Sourdough" })).toHaveAttribute("aria-pressed", "true")
		await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled()
	},
}

// a podcast episode already pinned, so the list is the pins as they stand
export const Episodes: Story = {
	args: {
		noun: "podcasts",
		pageItem: { id: "episode-1", label: "E4 · Grinders, scales, and the pour" },
		homeItems: [{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" }],
		isPageItemOnHome: true,
	},
}

// the X on a pinned row asks for confirmation, then clears that row alone and keeps the dialog open
export const Dropped: Story = {
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog"))
		await userEvent.click(dialog.getByRole("button", { name: "Remove City cycling from the featured topics" }))
		// the removal asks for confirmation before the save goes out
		const confirmDialog = within(await screen.findByRole("dialog", { name: "Remove from featured topics?" }))
		await userEvent.click(confirmDialog.getByRole("button", { name: "Remove" }))
		await expect(args.onSave).toHaveBeenCalledWith([{ id: "topic-city-cycling", position: 0 }])
		await expect(dialog.queryByRole("button", { name: "Remove City cycling from the featured topics" })).toBeNull()
		await expect(args.onClose).not.toHaveBeenCalled()
	},
}
