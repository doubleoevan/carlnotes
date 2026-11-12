// the Topic Post card: a published Topic Post with its summary and reactions, its author's draft, and a Topic Post
// with neither
import { fetchTopicPost } from "@carlnotes/client/topicPostClient"
import {
	TOPIC_POST_CARD_STORY,
	TOPIC_POST_DISCUSSION_STORY,
	TOPIC_POST_DRAFT_CARD_STORY,
} from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, within } from "storybook/test"
import { findVisibleByText } from "../../../.storybook/play"
import { TopicPostCard } from "./TopicPostCard"

const meta = {
	title: "TopicPost/TopicPostCard",
	component: TopicPostCard,
	args: { topicPost: TOPIC_POST_CARD_STORY, onOpen: fn() },
	// the info popup reads the card's Topic Post, so no story reaches the api
	beforeEach: () => {
		mocked(fetchTopicPost).mockResolvedValue(TOPIC_POST_DISCUSSION_STORY)
	},
	decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof TopicPostCard>

export default meta
type Story = StoryObj<typeof meta>

// the card as a Topic's Open Mic section shows it. the info button reads the Topic Post and opens its author, its
// Topic, its discussion, and the summary under its label
export const Default: Story = {
	play: async ({ canvas, canvasElement }) => {
		await canvas.getByRole("button", { name: "About this post" }).click()
		const popover = within(canvasElement.ownerDocument.body)
		await findVisibleByText(TOPIC_POST_CARD_STORY.summary ?? "")
		await expect(popover.getByText("Carl's Notes")).toBeVisible()
		await expect(popover.getByRole("link", { name: TOPIC_POST_CARD_STORY.topicName })).toBeVisible()
	},
}

// the author's own draft is marked Draft in the date's place
export const Draft: Story = { args: { topicPost: TOPIC_POST_DRAFT_CARD_STORY } }

// a Topic Post with no summary and no reactions yet keeps its byline alone
export const NoSummary: Story = { args: { topicPost: { ...TOPIC_POST_CARD_STORY, summary: null, reactionCount: 0 } } }

// a published Topic Post whose image is still to be drawn pulses its empty frame
export const PendingImage: Story = { args: { topicPost: { ...TOPIC_POST_CARD_STORY, image: null } } }
