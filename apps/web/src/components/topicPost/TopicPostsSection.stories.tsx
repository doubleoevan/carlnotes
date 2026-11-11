// a Topic's Open Mic section: an editor's, with the draft first and the button, a reader's, and an editor's with no
// post yet
import { TOPIC_POST_CARD_STORY, TOPIC_POST_DRAFT_CARD_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { TopicPostsSection } from "./TopicPostsSection"

const meta = {
	title: "TopicPost/TopicPostsSection",
	component: TopicPostsSection,
	args: {
		topicId: "topic-1",
		topicPosts: [TOPIC_POST_DRAFT_CARD_STORY, TOPIC_POST_CARD_STORY],
		canPublish: true,
	},
	parameters: { layout: "padded" },
} satisfies Meta<typeof TopicPostsSection>

export default meta
type Story = StoryObj<typeof meta>

// an editor sees their draft first, the count at the far right of the title, and the button that starts a draft
export const Default: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("2 posts")).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Post" })).toBeVisible()
	},
}

// a reader sees the published cards and no button
export const Reader: Story = {
	args: { topicPosts: [TOPIC_POST_CARD_STORY], canPublish: false },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Post" })).toBeNull()
	},
}

// an editor of a Topic with no post yet sees the button and the empty line in a card, with no count
export const Empty: Story = {
	args: { topicPosts: [] },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Post" })).toBeVisible()
		await expect(canvas.getByText("No one stepped up to the mic yet.")).toBeVisible()
	},
}
