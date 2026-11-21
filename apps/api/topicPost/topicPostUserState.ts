// the user's own part of a public Topic Post's page, which its page read sends beside the visitors' copy
import type { TopicPostUserState } from "@carlnotes/contracts/pageUserStates"
import { type CommentTarget, type SocialTarget, toSocialTargetKey } from "@carlnotes/contracts/social"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { loadCommentCounts, loadReplyCounts, loadReportedCommentIds } from "../social/commentRows"
import { loadReactionSummaries } from "../social/reactionRows"
import type { SocialReader } from "../social/socialRows"
import { loadUserBlocksBetween } from "../userBlocks"
import { loadTopicPostHtmlWithoutReportedImages, toTopicPostHtmlForReader } from "./topicPostBodyImages"
import { isTopicPostImageReported, type TopicPostRow, toTopicPostTarget } from "./topicPosts"

// the user, the post's row, and the visitors' copy of its page
type LoadTopicPostUserStateOptions = { userId: string; topicPostRow: TopicPostRow; topicPost: TopicPostResponse }

/**
 * Loads the user's own part of a public Topic Post's page that they neither wrote nor may edit: the reactions of the
 * post and of every comment and reply the copy lists as the user sees them, the comments they reported, whether they
 * reported the image, the body without the images they reported, and, for a user in a user block, the listed authors
 * in one with them and the thread's counts without those people. Only listed authors are named, so a reader never
 * learns who blocked them from a thread that person is not in.
 */
export async function loadTopicPostUserState({
	userId,
	topicPostRow,
	topicPost,
}: LoadTopicPostUserStateOptions): Promise<TopicPostUserState> {
	// the comments and replies that the copy lists, and the social targets of the post and of each of them
	const listedComments = (topicPost.commentThread?.comments ?? []).flatMap((comment) => [comment, ...comment.replies])
	const listedCommentIds = listedComments.map((comment) => comment.id)
	const postTarget = toTopicPostTarget(topicPost.id)
	const socialTargets: SocialTarget[] = [
		postTarget,
		...listedCommentIds.map((commentId) => ({ kind: "comment" as const, id: commentId })),
	]

	// the reactions, the reports, the body as the user reads it, and the user blocks, read together
	const [reactionSummaries, reportedCommentIds, isImageReported, readerHtml, { userBlockUserIds }] = await Promise.all([
		loadReactionSummaries({ userId, targets: socialTargets }),
		loadReportedCommentIds(userId, listedCommentIds),
		isTopicPostImageReported(userId, topicPostRow.topicPost),
		loadTopicPostHtmlWithoutReportedImages(userId, topicPostRow),
		loadUserBlocksBetween(userId),
	])

	// a user in a user block counts the thread without the people in one with them
	const reader: SocialReader = { userId, canModerate: false, canShare: false }
	const commentTarget: CommentTarget = { kind: "post", id: topicPost.id }
	const topLevelCommentIds = (topicPost.commentThread?.comments ?? []).map((comment) => comment.id)
	const blockedCommentCounts =
		userBlockUserIds.size > 0
			? await Promise.all([loadCommentCounts(reader, commentTarget), loadReplyCounts(reader, topLevelCommentIds)])
			: null
	return {
		userId,
		reactionsByTargetKey: Object.fromEntries(
			socialTargets.flatMap((socialTarget) => {
				const targetKey = toSocialTargetKey(socialTarget)
				const reactionSummary = reactionSummaries.get(targetKey)
				return reactionSummary ? [[targetKey, reactionSummary]] : []
			}),
		),
		reportedCommentIds,
		isImageReported,
		// the copy's body is the saved one, so a body that reported no image changes nothing
		html: readerHtml === topicPostRow.topicPost.html ? null : toTopicPostHtmlForReader(readerHtml, { isSigned: false }),
		blockedUserIds: [
			...new Set(
				listedComments.flatMap((comment) =>
					comment.author && userBlockUserIds.has(comment.author.userId) ? [comment.author.userId] : [],
				),
			),
		],
		blockedCommentCounts: blockedCommentCounts
			? {
					...blockedCommentCounts[0],
					replyCountByCommentId: Object.fromEntries(
						topLevelCommentIds.map((commentId) => [commentId, blockedCommentCounts[1].get(commentId) ?? 0]),
					),
				}
			: null,
	}
}
