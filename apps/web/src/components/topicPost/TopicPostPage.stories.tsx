// the Topic Post page: a published post with and without a summary, and the page at the largest text size
import { TopicPostPage } from "@carlnotes/core/components/TopicPostPage"
import { TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useEffect } from "react"
import { expect, fn, within } from "storybook/test"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { TOPIC_POST_PAGE_ELEMENTS } from "@/pages/TopicPostPage"

// the root text size the web is built to hold, twice the default
const LARGEST_TEXT_SIZE = "200%"

const meta = {
	title: "TopicPost/TopicPostPage",
	component: TopicPostPage,
	args: {
		topicPost: TOPIC_POST_DISCUSSION_STORY,
		isSignedIn: false,
		isEditing: false,
		onPublished: fn(),
		onEditDone: fn(),
		onChanged: fn(),
		elements: TOPIC_POST_PAGE_ELEMENTS,
	},
	decorators: [(Story) => <main className={PAGE_CLASS}>{Story()}</main>],
} satisfies Meta<typeof TopicPostPage>

export default meta
type Story = StoryObj<typeof meta>

// a reader's page: the title with its info popup, the byline then the reactions, the details line under them, the
// discussion, and the body
export const Default: Story = {
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("heading", { level: 1, name: /Light roasts, ranked/ })).toBeVisible()

		// the date, the reading time, and the thread's comment count sit on their own line under the byline's row
		const readingTime = canvas.getByText("2 min read ·")
		await expect(canvas.getByText("4 hot takes")).toBeVisible()
		await expect(readingTime.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			canvas.getByRole("link", { name: TOPIC_POST_DISCUSSION_STORY.topicName }).getBoundingClientRect().bottom,
		)
		await expect(canvas.getByText("Coffee Break Discussion")).toBeVisible()
		await canvas.getByRole("button", { name: "About this post" }).click()
		const popover = within(canvasElement.ownerDocument.body)
		await expect(await popover.findByText(TOPIC_POST_DISCUSSION_STORY.summary ?? "")).toBeVisible()
	},
}

// the count the comment thread reports replaces the one the post came with, and an edited post says so last
export const EditedWithOneComment: Story = {
	args: {
		topicPost: { ...TOPIC_POST_DISCUSSION_STORY, editedAt: "2026-11-03T16:05:00.000Z" },
		commentCount: 1,
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("1 hot take ·")).toBeVisible()
		await expect(canvas.getByText("edited")).toBeVisible()
	},
}

// a post whose summary is not written yet shows no discussion yet
export const NoSummary: Story = {
	args: { topicPost: { ...TOPIC_POST_DISCUSSION_STORY, summary: null, discussion: null } },
	play: async ({ canvas }) => {
		await expect(canvas.queryByText("Coffee Break Discussion")).toBeNull()
	},
}

// at twice the text size the page still fits its width, with nothing cut off
export const LargestTextSize: Story = {
	decorators: [
		(Story) => {
			// scale every rem on the page for this story alone
			useEffect(() => {
				const rootStyle = document.documentElement.style
				const previousFontSize = rootStyle.fontSize
				rootStyle.fontSize = LARGEST_TEXT_SIZE
				return () => {
					rootStyle.fontSize = previousFontSize
				}
			}, [])
			return Story()
		},
	],
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("heading", { level: 1 })).toBeVisible()
		const page = canvasElement.ownerDocument.documentElement
		await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
	},
}
