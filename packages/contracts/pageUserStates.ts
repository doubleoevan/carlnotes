// the user states of the page reads that a signed-in reader shares with visitors: what only that reader sees on a
// profile, a team page, and a Topic Post, which the apps merge into the shared copy
import { z } from "zod"
import { chatMention } from "./chat"
import { reactionSummary } from "./social"
import { teamIdentity } from "./teamIdentity"

// the user state of a page's topic table and topic cards: the owning team of each topic whose private team the
// user belongs to, which the shared copy leaves unnamed, the user's email switch on each topic they follow, and each
// card topic's reaction count without the people in a user block with the user, null for a user in no user block
const topicsUserState = z.object({
	teamByTopicId: z.record(z.string(), teamIdentity),
	isEmailEnabledByTopicId: z.record(z.string(), z.boolean()),
	reactionCountByTopicId: z.record(z.string(), z.number().int().nonnegative()).nullable(),
})

export type TopicsUserState = z.infer<typeof topicsUserState>

// the user state of someone else's profile: whether the user blocked the person, and the topics' part
export const profileUserState = topicsUserState.extend({ isBlocked: z.boolean() })

export type ProfileUserState = z.infer<typeof profileUserState>

// the user state of a team page they are not a member of: their join request, their unseen chat mentions in the
// team's chat room, and the topics' part
export const teamUserState = topicsUserState.extend({
	hasRequestedToJoin: z.boolean(),
	chatMentions: z.array(chatMention),
})

export type TeamUserState = z.infer<typeof teamUserState>

// the thread counts of a user in a user block: every comment and reply they see, the ones the last seven days added,
// and the reply count of each top-level comment the page lists
const blockedCommentCounts = z.object({
	commentCount: z.number().int().nonnegative(),
	weekCommentCount: z.number().int().nonnegative(),
	replyCountByCommentId: z.record(z.string(), z.number().int().nonnegative()),
})

// the user state of a public Topic Post they neither wrote nor may edit: the user, the post's and each listed
// comment's and reply's reaction summary as the user sees it by target key, the comments the user reported, whether
// they reported the post's image, the body without the images they reported or null if they reported none, the authors
// of the listed comments and replies who are in a user block with the user, whose comments the page leaves out, and
// the thread counts without those people, null for a user in no user block
export const topicPostUserState = z.object({
	userId: z.string(),
	reactionsByTargetKey: z.record(z.string(), reactionSummary),
	reportedCommentIds: z.array(z.string()),
	isImageReported: z.boolean(),
	html: z.string().nullable(),
	blockedUserIds: z.array(z.string()),
	blockedCommentCounts: blockedCommentCounts.nullable(),
})

export type TopicPostUserState = z.infer<typeof topicPostUserState>
