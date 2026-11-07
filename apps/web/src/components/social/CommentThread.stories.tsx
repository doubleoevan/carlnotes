// the comment thread in its card: the composer's button, the comments newest first with mentions
// linked, each with its reactions and its replies, the flame of a comment shared with Carl, and a Podcast Episode's
// chapter tags
import { fetchCommentThread, fetchMentionSuggestions, postComment } from "@carlnotes/client/socialClient"
import { EMPTY_COMMENT_THREAD } from "@carlnotes/contracts/social"
import {
	TEST_COMMENT_CHAPTERS,
	toTestChapterCommentThread,
	toTestComment,
	toTestCommentReply,
	toTestCommentThread,
	toTestEditorCommentThread,
	toTestOwnComment,
} from "@carlnotes/contracts/socialTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor, within } from "storybook/test"
import { CommentThread } from "./CommentThread"

const meta = {
	title: "Social/CommentThread",
	component: CommentThread,
	args: {
		target: { kind: "topic", id: "topic-llm-tooling" },
		firstPage: toTestCommentThread(),
		isSignedIn: true,
		topicId: "topic-llm-tooling",
		isTopicOwner: false,
	},
	argTypes: { target: { control: false }, firstPage: { control: "object" }, onChapterPress: { control: false } },
	parameters: { session: "user", surface: "card" },
} satisfies Meta<typeof CommentThread>

export default meta
type Story = StoryObj<typeof meta>

// a comment that mentions someone, with a reply and a flag, and Carl's own comment, with none
export const WithComments: Story = {}

// no comments yet: the composer's button alone
export const Empty: Story = { args: { firstPage: EMPTY_COMMENT_THREAD } }

// the user's own comment inside its edit time, and a Topic owner's delete on someone else's
export const OwnAndModerated: Story = {
	args: {
		isTopicOwner: true,
		firstPage: toTestCommentThread({ comments: [toTestOwnComment(), toTestComment({ canDelete: true })] }),
	},
}

// the user's own comment past its edit time: Edit disabled with its reason, and the delete stays
export const LockedOwn: Story = {
	args: { firstPage: toTestCommentThread({ comments: [toTestOwnComment({ isEditable: false })] }) },
}

// a Topic's editor, who presses the flame to share a comment with Carl: one shared, two shared comment slots free
export const TopicEditor: Story = {
	args: { isTopicOwner: true, firstPage: toTestEditorCommentThread({ usedCount: 1, slotCount: 3 }) },
}

// a Topic's editor with every shared comment slot used: the flame on an unshared comment is disabled
export const NoFreeSlot: Story = {
	args: { isTopicOwner: true, firstPage: toTestEditorCommentThread({ usedCount: 1, slotCount: 1 }) },
}

// a user who may not share sees the flame on a shared comment alone, with no press
export const SharedComment: Story = {
	args: { firstPage: toTestCommentThread({ comments: [toTestComment({ isSharedWithCarl: true })] }) },
}

// a comment with more replies than came with the thread
export const WithMoreReplies: Story = {
	args: {
		firstPage: toTestCommentThread({
			comments: [toTestComment({ replyCount: 5, replies: [toTestCommentReply()] })],
		}),
	},
}

// a Podcast Episode's thread, where a comment's chapter tag plays from that chapter
export const PodcastEpisodeChapters: Story = {
	args: {
		target: { kind: "podcastEpisode", id: "episode-1" },
		chapters: TEST_COMMENT_CHAPTERS,
		onChapterPress: fn(),
		firstPage: toTestChapterCommentThread(),
	},
}

// an older page waits behind the first
export const WithMore: Story = { args: { firstPage: toTestCommentThread({ nextCursor: "cursor-2" }) } }

// a thread that loads as it opens, as in a finding's popover, and fails
export const LoadFailed: Story = {
	args: { firstPage: undefined },
	beforeEach: () => {
		mocked(fetchCommentThread).mockRejectedValue(new Error("comments read failed: 500"))
	},
}

// a visitor reads the thread, with no flag, and the button opens sign-up
export const Visitor: Story = { args: { isSignedIn: false }, parameters: { session: "visitor" } }

// a trailing mention suggests users, and a posted comment shows first
export const PostsWithMention: Story = {
	args: { firstPage: EMPTY_COMMENT_THREAD },
	play: async ({ canvasElement, userEvent }) => {
		mocked(fetchMentionSuggestions).mockResolvedValue([
			{ userId: "user-roast", username: "roastmaster", avatarSource: null, avatarVersion: null },
		])
		const postedComment = toTestOwnComment({
			id: "comment-new",
			body: "Worth a look @roastmaster",
			mentions: [{ userId: "user-roast", username: "roastmaster" }],
		})
		mocked(postComment).mockResolvedValue({ status: "saved", comment: postedComment, sharedCommentSlots: null })

		// type a mention's start in the composer's dialog, pick the suggestion, and post
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole("button", { name: "Hot Take" }))
		const dialog = within(await within(document.body).findByRole("dialog"))
		await userEvent.type(dialog.getByRole("textbox"), "Worth a look @roa")
		await userEvent.click(await dialog.findByRole("button", { name: "@roastmaster" }))
		await userEvent.click(dialog.getByRole("button", { name: "Post" }))
		await waitFor(() => expect(canvas.getByRole("link", { name: "@roastmaster" })).toBeVisible())
	},
}

// Reply opens the composer on a comment, and the posted reply joins its replies
export const PostsReply: Story = {
	play: async ({ canvasElement, userEvent }) => {
		const postedReply = toTestOwnComment({
			id: "reply-new",
			body: "Same here on 7B.",
			parentCommentId: "comment-1",
		})
		mocked(postComment).mockResolvedValue({ status: "saved", comment: postedReply, sharedCommentSlots: null })
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getAllByRole("button", { name: "Reply" })[0] as HTMLElement)
		const dialog = within(await within(document.body).findByRole("dialog"))
		await userEvent.type(dialog.getByRole("textbox"), "Same here on 7B.")
		await userEvent.click(dialog.getByRole("button", { name: "Post" }))
		await waitFor(() => expect(canvas.getByText("Same here on 7B.")).toBeVisible())
		await expect(postComment).toHaveBeenLastCalledWith(
			expect.objectContaining({ body: "Same here on 7B.", parentCommentId: "comment-1" }),
		)
	},
}
