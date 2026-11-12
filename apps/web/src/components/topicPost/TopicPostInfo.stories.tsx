// a Topic Post's info popup: a published post with every section, its author's draft, a post that is gone, and the
// notebook and pen tile a row opens it from
import { fetchTopicPost } from "@carlnotes/client/topicPostClient"
import { TOPIC_POST_DISCUSSION_STORY, TOPIC_POST_SHORT_DRAFT_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, within } from "storybook/test"
import { findVisibleByText } from "../../../.storybook/play"
import { TopicPostInfo, TopicPostInfoButton } from "./TopicPostInfo"

const meta = {
	title: "TopicPost/TopicPostInfo",
	component: TopicPostInfo,
	args: { topicPostId: TOPIC_POST_DISCUSSION_STORY.id, title: TOPIC_POST_DISCUSSION_STORY.title },
	// the popup reads the story's post once it opens, so no story reaches the api
	beforeEach: () => {
		mocked(fetchTopicPost).mockResolvedValue(TOPIC_POST_DISCUSSION_STORY)
	},
} satisfies Meta<typeof TopicPostInfo>

export default meta
type Story = StoryObj<typeof meta>

// the note icon reads the post and opens its author with Share, its Topic, its discussion, and Carl's notes
export const Default: Story = {
	play: async ({ canvas, canvasElement }) => {
		await canvas.getByRole("button", { name: "About this post" }).click()
		const popover = within(canvasElement.ownerDocument.body)
		await findVisibleByText("Written by")
		await expect(popover.getByRole("link", { name: TOPIC_POST_DISCUSSION_STORY.author.username })).toBeVisible()
		await expect(popover.getByRole("button", { name: /^Share/ })).toBeVisible()
		await expect(popover.getByRole("link", { name: TOPIC_POST_DISCUSSION_STORY.topicName })).toBeVisible()

		// the Topic's visitors and followers sit under its name
		await expect(popover.getByText("128 visitors ·")).toBeVisible()
		await expect(popover.getByText("14 followers")).toBeVisible()
		await expect(popover.getByText("Coffee Break Discussion")).toBeVisible()
		await expect(popover.getByText(TOPIC_POST_DISCUSSION_STORY.summary ?? "")).toBeVisible()
	},
}

// a draft has no reactions, no Share, no discussion, and no notes yet
export const Draft: Story = {
	args: { topicPostId: TOPIC_POST_SHORT_DRAFT_STORY.id, title: TOPIC_POST_SHORT_DRAFT_STORY.title },
	beforeEach: () => {
		mocked(fetchTopicPost).mockResolvedValue(TOPIC_POST_SHORT_DRAFT_STORY)
	},
	play: async ({ canvas, canvasElement }) => {
		await canvas.getByRole("button", { name: "About this post" }).click()
		const popover = within(canvasElement.ownerDocument.body)
		await findVisibleByText("No notes yet.")
		await expect(popover.queryByRole("button", { name: /^Share/ })).toBeNull()
		await expect(popover.queryByText("Coffee Break Discussion")).toBeNull()
	},
}

// a post that is gone, or that the reader may not open, shows one line under its title
export const Unavailable: Story = {
	beforeEach: () => {
		mocked(fetchTopicPost).mockResolvedValue(null)
	},
	play: async ({ canvas }) => {
		await canvas.getByRole("button", { name: "About this post" }).click()
		await findVisibleByText("Carl couldn't open this post's note.")
	},
}

// a row's notebook and pen tile opens the same popup
export const RowButton: Story = {
	render: (args) => <TopicPostInfoButton {...args} />,
	play: async ({ canvas }) => {
		await canvas.getByRole("button", { name: "About this post" }).click()
		await findVisibleByText("Carl's Notes")
	},
}
