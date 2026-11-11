// the Topic Post discussion card: a recording to play, its transcript closed and open, one on its way, none yet, and
// the month's limit
import { TOPIC_POST_DISCUSSION_EDITOR_STORY, TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn } from "storybook/test"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { TopicPostDiscussionCard } from "./TopicPostDiscussionCard"

const meta = {
	title: "TopicPost/TopicPostDiscussionCard",
	component: TopicPostDiscussionCard,
	args: { topicPost: TOPIC_POST_DISCUSSION_STORY, onChanged: fn(), sendRegeneration: fn(async () => "discussion-2") },
	decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
} satisfies Meta<typeof TopicPostDiscussionCard>

export default meta
type Story = StoryObj<typeof meta>

// the first line of the story recording's transcript
const FIRST_TRANSCRIPT_LINE = "Vienna, this post ranks a year of light roasts."

// a reader plays the recording, and sees no Regenerate. the transcript is in the page, closed
export const Playing: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("3 min · Carl and Vienna discuss amongst themselves")).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Regenerate" })).toBeNull()
		await expect(canvas.getByText(FIRST_TRANSCRIPT_LINE)).not.toBeVisible()
	},
}

// a press on the card's name opens the transcript, each turn after its speaker's name
export const TranscriptOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("heading", { name: "Coffee Break Discussion" }))
		await expect(canvas.getByText(FIRST_TRANSCRIPT_LINE)).toBeVisible()
		await expect(canvas.getAllByText("Vienna:")).toHaveLength(2)
	},
}

// without JavaScript the transcript is closed too, and the name's details element opens it
export const TranscriptWithoutJavaScript: Story = {
	parameters: { hasJavaScript: false, docs: toOwnFrameDocs(120) },
	play: async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector("details")?.open).toBe(false)
		await expect(canvas.getByText(FIRST_TRANSCRIPT_LINE)).not.toBeVisible()
	},
}

// whoever may publish on the Topic opens the note for the hosts, with the month's count, and starts a recording
export const Regenerate: Story = {
	args: { topicPost: TOPIC_POST_DISCUSSION_EDITOR_STORY },
	play: async ({ canvas, args, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Regenerate" }))
		await expect(canvas.getByText("1 of 10 used this month")).toBeVisible()
		await userEvent.type(canvas.getByLabelText("Discussion prompt"), "The pancake part")
		await userEvent.click(canvas.getByRole("button", { name: "Regenerate" }))
		await expect(args.sendRegeneration).toHaveBeenCalledWith(TOPIC_POST_DISCUSSION_EDITOR_STORY.id, "The pancake part")
	},
}

// the first recording on its way has no play button yet, offers no second start, and has no transcript to open
export const Recording: Story = {
	args: {
		topicPost: {
			...TOPIC_POST_DISCUSSION_EDITOR_STORY,
			discussion: { id: null, durationSeconds: null, publishedAt: null, isRecording: true },
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Carl and Vienna are discussing.")).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Regenerate" })).toBeNull()
		await expect(canvasElement.querySelector("details")).toBeNull()
	},
}

// a post with no discussion shows the card to whoever may record one, and nothing to anyone else
export const NoDiscussion: Story = {
	args: { topicPost: { ...TOPIC_POST_DISCUSSION_EDITOR_STORY, discussion: null } },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Not recorded yet.")).toBeVisible()
	},
}

// at the month's limit the recording still plays, and Regenerate is absent
export const Limit: Story = {
	args: { topicPost: { ...TOPIC_POST_DISCUSSION_EDITOR_STORY, discussionRegenerationQuota: { used: 10, limit: 10 } } },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Regenerate" })).toBeNull()
	},
}
