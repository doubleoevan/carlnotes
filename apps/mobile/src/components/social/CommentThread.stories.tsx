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
import type { Meta, StoryObj } from "@storybook/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { View } from "react-native"
import { CommentThread } from "./CommentThread"

// the query cache a row's flag reads
const STORY_QUERY_CLIENT = new QueryClient()

// the same states as the web's comment thread stories, each from a supplied first page
const meta: Meta<typeof CommentThread> = {
	title: "Social/CommentThread",
	component: CommentThread,
	args: {
		target: { kind: "topic", id: "topic-1" },
		firstPage: toTestCommentThread(),
		isSignedIn: true,
		topicId: "topic-1",
		isTopicOwner: false,
	},
	parameters: { webReference: "apps/web/src/components/social/CommentThread.tsx at 375px" },
	decorators: [
		(Story) => (
			<QueryClientProvider client={STORY_QUERY_CLIENT}>
				<View style={{ width: "100%" }}>
					<Story />
				</View>
			</QueryClientProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const WithComments: Story = {}
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
		onChapterPress: () => undefined,
		firstPage: toTestChapterCommentThread(),
	},
}
export const WithMore: Story = { args: { firstPage: toTestCommentThread({ nextCursor: "cursor-2" }) } }
export const Visitor: Story = { args: { isSignedIn: false } }
