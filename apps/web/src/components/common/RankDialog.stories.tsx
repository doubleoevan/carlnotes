// the list that orders pinned rows: a topic joining the home's list, the first pin of all, a podcast episode already
// pinned, a pinned row removed after a confirmation, a person's own pins with the picker that adds a row, and a Topic
// Post's page offering its post a place
import { toHomeRankDialogLabels, toProfileRankDialogLabels } from "@carlnotes/core/lib/rankDialog"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, screen, within } from "storybook/test"
import { RankDialog } from "./RankDialog"

// three home topics, and the page's topic, not among them
const HOME_TOPICS = [
	{ id: "topic-llm-tooling", label: "LLM tooling" },
	{ id: "topic-home-espresso", label: "Home espresso" },
	{ id: "topic-city-cycling", label: "City cycling" },
]
const PAGE_TOPIC = { id: "topic-sourdough", label: "Sourdough" }

const meta = {
	title: "Common/RankDialog",
	component: RankDialog,
	args: {
		labels: toHomeRankDialogLabels("topics"),
		pageItem: PAGE_TOPIC,
		pinnedItems: HOME_TOPICS,
		isPageItemPinned: false,
		onSave: fn(async () => {}),
		onClose: fn(),
	},
	argTypes: { pageItem: { control: false }, pinnedItems: { control: false }, labels: { control: false } },
	parameters: { session: "admin" },
} satisfies Meta<typeof RankDialog>

export default meta
type Story = StoryObj<typeof meta>

// the page's topic appended at the end, with the check on its row, and Save sends the order as it stands
export const Default: Story = {
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog"))
		await expect(dialog.getByRole("button", { name: "4 Sourdough" })).toHaveAttribute("aria-pressed", "true")
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(args.onSave).toHaveBeenCalledWith([
			{ id: "topic-llm-tooling", position: 1 },
			{ id: "topic-home-espresso", position: 2 },
			{ id: "topic-city-cycling", position: 3 },
			{ id: "topic-sourdough", position: 4 },
		])
	},
}

// the first pin of all: the page's podcast episode is the only row, and Save pins it at position one
export const First: Story = {
	args: {
		labels: toHomeRankDialogLabels("podcasts"),
		pageItem: { id: "episode-1", label: "E4 · Grinders, scales, and the pour" },
		pinnedItems: [],
	},
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog"))
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(args.onSave).toHaveBeenCalledWith([{ id: "episode-1", position: 1 }])
	},
}

// a podcast episode already pinned, so the list is the pins as they stand
export const Episodes: Story = {
	args: {
		labels: toHomeRankDialogLabels("podcasts"),
		pageItem: { id: "episode-1", label: "E4 · Grinders, scales, and the pour" },
		pinnedItems: [{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" }],
		isPageItemPinned: true,
	},
}

// the X on a pinned row asks for confirmation, then clears that row alone and keeps the dialog open
export const Dropped: Story = {
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog"))
		await userEvent.click(dialog.getByRole("button", { name: "Remove City cycling from the home topics" }))
		// the removal asks for confirmation before the save goes out
		const confirmDialog = within(await screen.findByRole("dialog", { name: "Remove from home topics?" }))
		await userEvent.click(confirmDialog.getByRole("button", { name: "Remove" }))
		await expect(args.onSave).toHaveBeenCalledWith([{ id: "topic-city-cycling", position: 0 }])
		await expect(dialog.queryByRole("button", { name: "Remove City cycling from the home topics" })).toBeNull()
		await expect(args.onClose).not.toHaveBeenCalled()
	},
}

// a person's own pins: no page item, two pinned topics, and the picker that offers their other public topics
export const Profile: Story = {
	args: {
		labels: toProfileRankDialogLabels("topics"),
		pageItem: undefined,
		pinnedItems: HOME_TOPICS.slice(0, 2),
		candidateItems: [...HOME_TOPICS, PAGE_TOPIC],
		limit: 12,
	},
	parameters: { session: "user" },
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog", { name: "Featured topics" }))
		await expect(dialog.getByRole("combobox", { name: "Add a topic" })).toBeInTheDocument()
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(args.onSave).toHaveBeenCalledWith([
			{ id: "topic-llm-tooling", position: 1 },
			{ id: "topic-home-espresso", position: 2 },
		])
	},
}

// a person with no pin yet reads the empty line above the picker
export const ProfileEmpty: Story = {
	args: {
		labels: toProfileRankDialogLabels("podcasts"),
		pageItem: undefined,
		pinnedItems: [],
		candidateItems: [{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" }],
		limit: 12,
	},
	parameters: { session: "user" },
	play: async () => {
		const dialog = within(await screen.findByRole("dialog", { name: "Featured podcasts" }))
		await expect(dialog.getByText("No featured podcasts yet.")).toBeInTheDocument()
	},
}

// a person's own pinned films, each named by its podcast episode's title and its topic, and the picker that offers
// their other films
export const ProfileFilms: Story = {
	args: {
		labels: toProfileRankDialogLabels("films"),
		pageItem: undefined,
		pinnedItems: [{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" }],
		candidateItems: [
			{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" },
			{ id: "episode-2", label: "The agents that shipped · LLM tooling" },
		],
		limit: 12,
	},
	parameters: { session: "user" },
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog", { name: "Featured films" }))
		await expect(dialog.getByRole("combobox", { name: "Add a film" })).toBeInTheDocument()
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(args.onSave).toHaveBeenCalledWith([{ id: "episode-1", position: 1 }])
	},
}

// a person's own pinned posts, each named by its title and its topic, with no limit, and the picker that offers
// their other posts
export const ProfilePosts: Story = {
	args: {
		labels: toProfileRankDialogLabels("posts"),
		pageItem: undefined,
		pinnedItems: [{ id: "post-1", label: "Dialing in a new grinder · Home espresso" }],
		candidateItems: [
			{ id: "post-1", label: "Dialing in a new grinder · Home espresso" },
			{ id: "post-2", label: "What a scale changes · Home espresso" },
		],
	},
	parameters: { session: "user" },
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog", { name: "Featured posts" }))
		await expect(dialog.getByRole("combobox", { name: "Add a post" })).toBeInTheDocument()
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(args.onSave).toHaveBeenCalledWith([{ id: "post-1", position: 1 }])
	},
}

// the admin's home posts, opened from the home page: no page item, no limit, and the picker over the newest posts
export const HomePosts: Story = {
	args: {
		labels: toHomeRankDialogLabels("posts"),
		pageItem: undefined,
		pinnedItems: [],
		candidateItems: [{ id: "post-2", label: "What a scale changes · Home espresso" }],
	},
	play: async () => {
		const dialog = within(await screen.findByRole("dialog", { name: "Home posts" }))
		await expect(dialog.getByText("No home posts.")).toBeInTheDocument()
		await expect(dialog.getByRole("combobox", { name: "Add a post" })).toBeInTheDocument()
	},
}

// the admin's home posts, opened from a Topic Post's page: the page's post appended at the end with the check on its
// row, and Save sends it the next position
export const HomePostsPage: Story = {
	args: {
		labels: toHomeRankDialogLabels("posts"),
		pageItem: { id: "post-2", label: "What a scale changes · Home espresso" },
		pinnedItems: [{ id: "post-1", label: "Dialing in a new grinder · Home espresso" }],
		candidateItems: [
			{ id: "post-1", label: "Dialing in a new grinder · Home espresso" },
			{ id: "post-2", label: "What a scale changes · Home espresso" },
		],
	},
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog", { name: "Home posts" }))
		const pagePostRow = dialog.getByRole("button", { name: "2 What a scale changes · Home espresso" })
		await expect(pagePostRow).toHaveAttribute("aria-pressed", "true")
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(args.onSave).toHaveBeenCalledWith([
			{ id: "post-1", position: 1 },
			{ id: "post-2", position: 2 },
		])
	},
}

// an author's own pinned posts, opened from one of their Topic Post's pages: the page's post appended at the end, and
// a press on the first row moves it there
export const ProfilePostsPage: Story = {
	args: {
		labels: toProfileRankDialogLabels("posts"),
		pageItem: { id: "post-2", label: "What a scale changes · Home espresso" },
		pinnedItems: [{ id: "post-1", label: "Dialing in a new grinder · Home espresso" }],
		candidateItems: [
			{ id: "post-1", label: "Dialing in a new grinder · Home espresso" },
			{ id: "post-2", label: "What a scale changes · Home espresso" },
		],
	},
	parameters: { session: "user" },
	play: async ({ userEvent, args }) => {
		const dialog = within(await screen.findByRole("dialog", { name: "Featured posts" }))
		await userEvent.click(dialog.getByRole("button", { name: "1 Dialing in a new grinder · Home espresso" }))
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(args.onSave).toHaveBeenCalledWith([
			{ id: "post-2", position: 1 },
			{ id: "post-1", position: 2 },
		])
	},
}
