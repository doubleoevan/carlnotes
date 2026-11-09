// the admin's featured order list: a topic joining the list, an episode already in it, and a drop that enables Save
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, screen, within } from "storybook/test"
import { FeatureRankDialog } from "./FeatureRankDialog"

// three featured topics, and the page's topic, not among them
const FEATURED_TOPICS = [
	{ id: "topic-llm-tooling", label: "LLM tooling" },
	{ id: "topic-home-espresso", label: "Home espresso" },
	{ id: "topic-city-cycling", label: "City cycling" },
]
const PAGE_TOPIC = { id: "topic-sourdough", label: "Sourdough" }

const meta = {
	title: "Common/FeatureRankDialog",
	component: FeatureRankDialog,
	args: {
		noun: "topics",
		pageItem: PAGE_TOPIC,
		featuredItems: FEATURED_TOPICS,
		isPageItemFeatured: false,
		onSave: fn(async () => {}),
		onClose: fn(),
	},
	argTypes: { pageItem: { control: false }, featuredItems: { control: false } },
	parameters: { session: "admin" },
} satisfies Meta<typeof FeatureRankDialog>

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

// an episode already featured, so the list is the pins as they stand
export const Episodes: Story = {
	args: {
		noun: "podcast episodes",
		pageItem: { id: "episode-1", label: "E4 · Grinders, scales, and the pour" },
		featuredItems: [{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" }],
		isPageItemFeatured: true,
	},
}

// dropping a row enables Save, which asks for confirmation, then sends the clear and the kept order top to bottom
export const Dropped: Story = {
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog"))
		await userEvent.click(dialog.getByRole("button", { name: "Remove City cycling from the featured topics" }))
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		// a dropped row asks for confirmation before the save goes out
		const confirmDialog = within(await screen.findByRole("dialog", { name: "Remove from featured topics?" }))
		await userEvent.click(confirmDialog.getByRole("button", { name: "Remove" }))
		await expect(args.onSave).toHaveBeenCalledWith([
			{ id: "topic-city-cycling", position: 0 },
			{ id: "topic-llm-tooling", position: 1 },
			{ id: "topic-home-espresso", position: 2 },
			{ id: "topic-sourdough", position: 3 },
		])
	},
}
