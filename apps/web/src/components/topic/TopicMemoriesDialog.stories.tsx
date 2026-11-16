import { fetchTopicMemories, rateTopicMemory } from "@carlnotes/client/topicMemoriesClient"
import {
	TOPIC_MEMORY_STORY_CORRECTION,
	TOPIC_MEMORY_STORY_TEXT,
	toTopicMemoryStoryPage,
} from "@carlnotes/core/lib/topicMemoryStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, screen, waitFor } from "storybook/test"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { TopicMemoriesDialog } from "./TopicMemoriesDialog"

const meta = {
	title: "Topic/TopicMemoriesDialog",
	component: TopicMemoriesDialog,
	args: { topicId: "coffee-journal", entryCount: 3, topicMemoryCount: 6, canRateTopicMemories: true },
	beforeEach: () => {
		mocked(fetchTopicMemories).mockImplementation(async ({ page }) => toTopicMemoryStoryPage({ page }))
		mocked(rateTopicMemory).mockResolvedValue({ status: "saved" })
	},
} satisfies Meta<typeof TopicMemoriesDialog>
export default meta
type Story = StoryObj<typeof meta>

export const OwnerOnPhone: Story = {
	globals: PHONE_VIEWPORT_GLOBALS,
	play: async ({ canvas, userEvent }) => {
		// open lazily, page through the read, and submit a correction under the same dialog
		const journal = canvas.getByRole("button", { name: "Journal" })
		await expect(canvas.getByText("3 entries · 6 takeaways")).toBeVisible()
		await expect(journal).toHaveTextContent(/📙\s*Journal/)
		await expect(fetchTopicMemories).not.toHaveBeenCalled()
		await userEvent.click(journal)
		await waitForTopicMemoriesDialog("6 Topic Takeaways 🧠")
		await waitFor(() => expect(screen.getByText(TOPIC_MEMORY_STORY_TEXT)).toBeVisible())
		await expect(screen.getByText("1", { selector: "span" })).toBeVisible()
		await expect(screen.queryByText("since E3")).not.toBeInTheDocument()

		// hold the second page so the loading state can be checked before it arrives
		const pendingPage = Promise.withResolvers<Awaited<ReturnType<typeof fetchTopicMemories>>>()
		mocked(fetchTopicMemories).mockImplementationOnce(() => pendingPage.promise)
		await userEvent.click(screen.getByRole("button", { name: /next page/i }))
		await expect(await screen.findByRole("list", { busy: true })).toBeVisible()
		await expect(screen.getByRole("navigation", { name: "Takeaways pages" })).toBeVisible()
		await expect(screen.queryByRole("textbox", { name: /feedback for Carl/i })).not.toBeInTheDocument()
		await expect(screen.getByText(TOPIC_MEMORY_STORY_TEXT)).not.toBeVisible()
		pendingPage.resolve(toTopicMemoryStoryPage({ page: 2 }))
		await expect(await screen.findByText("Cafés are using more low-caffeine blends.")).toBeVisible()
		await expect(screen.getByText("6", { selector: "span" })).toBeVisible()
		await userEvent.click(screen.getByRole("button", { name: /previous page/i }))
		const note = await screen.findByRole("textbox", { name: "Feedback for Carl (optional)" })
		await expect(note).toHaveAttribute("placeholder", "Tell Carl why this was good or bad…")
		await userEvent.type(note, TOPIC_MEMORY_STORY_CORRECTION)
		await userEvent.click(screen.getByRole("button", { name: /thumbs down/i }))
		await expect(rateTopicMemory).toHaveBeenCalledWith({
			topicId: "coffee-journal",
			topicMemoryId: "topic-memory-1",
			feedback: { rating: "down", note: TOPIC_MEMORY_STORY_CORRECTION },
		})
	},
}

export const ReadOnly: Story = {
	args: { canRateTopicMemories: false },
	beforeEach: () => {
		mocked(fetchTopicMemories).mockResolvedValue(toTopicMemoryStoryPage({ canRate: false }))
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Journal" }))
		await waitForTopicMemoriesDialog("6 Topic Takeaways 🧠")
		await waitFor(() => expect(screen.getByText(TOPIC_MEMORY_STORY_TEXT)).toBeVisible())
		await expect(screen.queryByRole("button", { name: /thumbs/i })).toBeNull()
	},
}

export const Empty: Story = {
	args: { entryCount: 0, topicMemoryCount: 0 },
	beforeEach: () => {
		mocked(fetchTopicMemories).mockResolvedValue(toTopicMemoryStoryPage({ isEmpty: true }))
	},
	play: async ({ canvas, userEvent }) => {
		// keep the empty counts visible before opening the Journal
		const journal = canvas.getByRole("button", { name: "Journal" })
		await expect(canvas.getByText("0 entries · 0 takeaways")).toBeVisible()
		await userEvent.click(journal)
		await waitForTopicMemoriesDialog("0 Topic Takeaways 🧠")
		await waitFor(() => expect(screen.getByText(/Carl hasn’t written any takeaways yet/)).toBeVisible())
	},
}

// visibility assertions run after the dialog's open animation in every story
async function waitForTopicMemoriesDialog(title: string): Promise<void> {
	const dialog = await screen.findByRole("dialog", { name: title })
	await Promise.allSettled(dialog.getAnimations().map(({ finished }) => finished))
	await expect(dialog).toBeVisible()
}
