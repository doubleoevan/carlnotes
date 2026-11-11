// the unseen Comment Mentions of a signed-in user, which their badges count and their list shows
import { z } from "zod"
import { commentTarget, socialId } from "./social"

// the kinds of page that hold a comment thread. a Finding's thread sits on its Topic's page
const commentMentionPageKinds = ["topic", "podcastEpisode", "post"] as const

// one unseen Comment Mention: the Comment that mentions the user, who wrote it, its first line as plain text, the
// thread and the page it sits on, and the path that opens the Comment on that page
const unseenCommentMention = z.object({
	commentId: z.string(),
	// null for a Comment by Carl
	author: z.object({ userId: z.string(), username: z.string() }).nullable(),
	text: z.string(),
	createdAt: z.string(),
	topicId: z.string(),
	target: commentTarget,
	page: z.object({ kind: z.enum(commentMentionPageKinds), id: z.string(), name: z.string() }),
	path: z.string(),
})

export type UnseenCommentMention = z.infer<typeof unseenCommentMention>

// a user's unseen Comment Mentions, newest first
export const unseenCommentMentionsResponse = z.object({ commentMentions: z.array(unseenCommentMention) })

// how many Comments one seen mark names at most
const SEEN_COMMENT_MAX_COUNT = 100

// the body that marks mentions seen: the Comments scrolled to, or every unseen mention
export const commentMentionsSeenPayload = z.union([
	z.object({ commentIds: z.array(socialId).min(1).max(SEEN_COMMENT_MAX_COUNT) }),
	z.object({ isEveryMention: z.literal(true) }),
])

export type CommentMentionsSeenPayload = z.infer<typeof commentMentionsSeenPayload>

// where a mention badge sits, which its open event reports
export type CommentMentionBadgePlace = "header" | "title" | "section"
