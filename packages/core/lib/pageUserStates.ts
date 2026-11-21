// the user state of a shared page read merged into the visitors' copy: a profile's, a team page's, and a Topic Post's,
// which web and mobile both show
import type { TeamPageResult } from "@carlnotes/client/teamClient"
import { type TopicCard, toReactionCount } from "@carlnotes/contracts/home"
import type { ProfilePageRead, TopicPostPageRead } from "@carlnotes/contracts/pageReads"
import type { TopicPostUserState, TopicsUserState } from "@carlnotes/contracts/pageUserStates"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import type { Topic } from "@carlnotes/contracts/profiles"
import {
	type CommentReply,
	type CommentThreadResponse,
	EMPTY_REACTION_SUMMARY,
	isInsideSocialEditTime,
	type ReactionSummary,
	type SocialTarget,
	toSocialTargetKey,
} from "@carlnotes/contracts/social"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"

/**
 * Returns a profile page read's profile with the user state merged into the visitors' copy, the profile as it is with
 * no user state, or null for no read.
 */
export function toProfileWithUserState(profilePageRead: ProfilePageRead): ProfileResponse
export function toProfileWithUserState(profilePageRead: ProfilePageRead | null | undefined): ProfileResponse | null
export function toProfileWithUserState(profilePageRead: ProfilePageRead | null | undefined): ProfileResponse | null {
	// no read, or a profile with no part of the user's
	if (!profilePageRead?.userState) {
		return profilePageRead?.profile ?? null
	}

	// the profile with the user's block, topic rows, and topic cards
	const { profile, userState } = profilePageRead
	return {
		...profile,
		isBlocked: userState.isBlocked,
		topics: toTopicsWithUserState(profile.topics, userState),
		profileTopics: profile.profileTopics.map((topicCard) => toTopicCardWithUserState(topicCard, userState)),
	}
}

/**
 * Returns a team page read with the user state that a visible page holds merged into the visitors' copy, and a gated
 * or missing team as it is.
 */
export function toTeamPageResultWithUserState(teamPageResult: TeamPageResult): TeamPageResult {
	return teamPageResult.status === "visible"
		? { status: "visible", team: toTeamPageWithUserState(teamPageResult.team) }
		: teamPageResult
}

// a team page with the user state that it holds merged into the visitors' copy, or the page as it is with no user state
function toTeamPageWithUserState(team: TeamPageResponse): TeamPageResponse {
	const { userState } = team
	if (!userState) {
		return team
	}
	return {
		...team,
		hasRequestedToJoin: userState.hasRequestedToJoin,
		chatMentions: userState.chatMentions,
		topics: toTopicsWithUserState(team.topics, userState),
		topicCards: team.topicCards.map((topicCard) => toTopicCardWithUserState(topicCard, userState)),
	}
}

// the topic table's rows with the owning teams the user sees named and the user's email switches
function toTopicsWithUserState(topics: Topic[], userState: TopicsUserState): Topic[] {
	return topics.map((topic) => ({
		...topic,
		team: userState.teamByTopicId[topic.id] ?? topic.team,
		isEmailEnabled: userState.isEmailEnabledByTopicId[topic.id] ?? topic.isEmailEnabled,
	}))
}

// a topic card with the owning team the user sees named, and its reaction count without the people in a user block
// with the user
function toTopicCardWithUserState<Card extends TopicCard>(topicCard: Card, userState: TopicsUserState): Card {
	return {
		...topicCard,
		teamLink: userState.teamByTopicId[topicCard.id] ?? topicCard.teamLink,
		reactionCount: userState.reactionCountByTopicId?.[topicCard.id] ?? topicCard.reactionCount,
	}
}

/**
 * Returns a Topic Post page read's post with the user state merged into the visitors' copy: the reactions as the
 * user sees them, their reports, the body without the images they reported, what they may do with their own comments,
 * and the thread without the people in a user block with them. Returns the post as it is with no user state, and null
 * for no read or no post.
 */
export function toTopicPostWithUserState(
	topicPostPageRead: TopicPostPageRead | null | undefined,
): TopicPostResponse | null {
	// no read, no post, or a post with no part of the user's
	const topicPost = topicPostPageRead?.topicPost ?? null
	const userState = topicPostPageRead?.userState ?? null
	if (!topicPost || !userState) {
		return topicPost
	}

	// the post's reactions as the user sees them
	const reactions = toUserReactions({ kind: "post", id: topicPost.id }, userState)
	return {
		...topicPost,
		reactions,
		reactionCount: toReactionCount(reactions),
		image: userState.isImageReported ? null : topicPost.image,
		html: userState.html ?? topicPost.html,
		commentThread: topicPost.commentThread && toCommentThreadWithUserState(topicPost.commentThread, userState),
	}
}

// a comment thread without the people in a user block with the user, with their counts, and each comment and reply as
// the user sees it
function toCommentThreadWithUserState(
	commentThread: CommentThreadResponse,
	userState: TopicPostUserState,
): CommentThreadResponse {
	// whether the user sees a comment's author, Carl included
	const blockedUserIds = new Set(userState.blockedUserIds)
	const isShownAuthor = (commentReply: CommentReply): boolean =>
		!commentReply.author || !blockedUserIds.has(commentReply.author.userId)

	// the counts without those people, for a user in a user block
	const { blockedCommentCounts } = userState
	return {
		...commentThread,
		comments: commentThread.comments.filter(isShownAuthor).map((comment) => ({
			...comment,
			...toCommentReplyWithUserState(comment, userState),
			replyCount: blockedCommentCounts?.replyCountByCommentId[comment.id] ?? comment.replyCount,
			replies: comment.replies.filter(isShownAuthor).map((reply) => toCommentReplyWithUserState(reply, userState)),
		})),
		commentCount: blockedCommentCounts?.commentCount ?? commentThread.commentCount,
		weekCommentCount: blockedCommentCounts?.weekCommentCount ?? commentThread.weekCommentCount,
	}
}

// a comment or a reply with its reactions as the user sees them, whether they reported it, and what they may do with
// it as its author. a user on the visitors' copy moderates nothing, so they delete only their own
function toCommentReplyWithUserState(commentReply: CommentReply, userState: TopicPostUserState): CommentReply {
	const isAuthor = commentReply.author?.userId === userState.userId
	return {
		...commentReply,
		reactions: toUserReactions({ kind: "comment", id: commentReply.id }, userState),
		isReported: userState.reportedCommentIds.includes(commentReply.id),
		isAuthor,
		isEditable: isAuthor && isInsideSocialEditTime(new Date(commentReply.createdAt)),
		canDelete: isAuthor,
	}
}

// a social target's reactions as the user sees them. a target with no entry has none the user sees
function toUserReactions(socialTarget: SocialTarget, userState: TopicPostUserState): ReactionSummary {
	return userState.reactionsByTargetKey[toSocialTargetKey(socialTarget)] ?? EMPTY_REACTION_SUMMARY
}
