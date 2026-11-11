// the comment routes: a thread's paged read, a comment's replies, a post, an edit, a delete, the share with the
// podcast, a Topic's shared comments, and the mention suggestions
import {
	commentRepliesQuery,
	commentThreadQuery,
	editCommentPayload,
	MENTION_SUGGESTION_LIMIT,
	mentionSuggestionsQuery,
	postCommentPayload,
	shareCommentPayload,
} from "@carlnotes/contracts/social"
import { toNormalizedUsername } from "@carlnotes/contracts/usernames"
import { db } from "@carlnotes/db"
import { toNoUserBlockBetweenFilter } from "@carlnotes/db/contentFilters"
import { users } from "@carlnotes/db/schema/users"
import { zValidator } from "@hono/zod-validator"
import { and, like, ne } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { withAvatarVersion } from "../avatars"
import { type AppContext, type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toObjectionableContentResponse } from "../moderation"
import { socialReadRateLimiter, toolCallerRateLimiter } from "../rateLimit"
import { toTermsOutdatedResponse } from "../termsAcceptance"
import { loadCommentPage, loadCommentReplyPage } from "./commentRows"
import { type CommentWriteResult, deleteComment, editComment, postComment, shareComment } from "./comments"
import { loadSharedComments } from "./sharedCommentRows"
import { resolveSocialTarget, toSocialReader } from "./socialTargets"

// the comment routes. a social target the caller cannot open is a 404, like one that does not exist
export const commentsRoute = new Hono<AppEnv>()
	.get("/comments", socialReadRateLimiter, zValidator("query", commentThreadQuery), async (context) => {
		// one page of the thread, for anyone who may open the social target
		const { kind, id, cursor, commentId } = context.req.valid("query")
		const userId = currentUser(context)
		const resolvedSocialTarget = await resolveSocialTarget(userId, { kind, id })
		if (!resolvedSocialTarget) {
			return context.json({ error: "not found" }, 404)
		}

		// the page as this reader sees it
		const { topic } = resolvedSocialTarget
		const reader = await toSocialReader(userId, topic)
		return context.json(await loadCommentPage({ reader, target: { kind, id }, topic, cursor, commentId }))
	})
	.get("/comments/:id/replies", socialReadRateLimiter, zValidator("query", commentRepliesQuery), async (context) => {
		// one page of a comment's replies, for anyone who may open what the comment hangs on
		const userId = currentUser(context)
		const parentCommentId = context.req.param("id")
		const resolvedSocialTarget = await resolveSocialTarget(userId, { kind: "comment", id: parentCommentId })
		if (!resolvedSocialTarget) {
			return context.json({ error: "not found" }, 404)
		}

		// the page as this reader sees it
		const reader = await toSocialReader(userId, resolvedSocialTarget.topic)
		const { cursor } = context.req.valid("query")
		return context.json(await loadCommentReplyPage({ reader, parentCommentId, cursor }))
	})
	.get("/topics/:id/shared-comments", socialReadRateLimiter, async (context) => {
		// a user who may read and edit the Topic gets the list, and anyone else a 404, like a missing Topic
		const userId = currentUser(context)
		const resolvedSocialTarget = await resolveSocialTarget(userId, { kind: "topic", id: context.req.param("id") })
		if (!userId || !resolvedSocialTarget || !(await isAllowed(userId, "topic:edit", resolvedSocialTarget.topic))) {
			return context.json({ error: "not found" }, 404)
		}

		// the list, most recently shared first
		return context.json({ comments: await loadSharedComments(resolvedSocialTarget.topic, userId) })
	})
	.put("/comments/:id/share", toolCallerRateLimiter, zValidator("json", shareCommentPayload), async (context) => {
		// a share is a signed-in user's, and the write checks that they may edit the Topic
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const commentShareResult = await shareComment({
			userId,
			commentId: context.req.param("id"),
			isSharedWithPodcast: context.req.valid("json").isSharedWithPodcast,
			analyticsProperties: toAnalyticsProperties(context),
		})

		// a full Topic returns 409, and a comment the user may not share reads as missing
		switch (commentShareResult.status) {
			case "saved":
				return context.json({
					isSharedWithPodcast: commentShareResult.isSharedWithPodcast,
					sharedCommentSlots: commentShareResult.sharedCommentSlots,
				})
			case "noFreeSharedCommentSlot":
				return context.json({ error: "no free shared comment slot" }, 409)
			case "notFound":
				return context.json({ error: "not found" }, 404)
		}
	})
	.post("/comments", toolCallerRateLimiter, zValidator("json", postCommentPayload), async (context) => {
		// a post needs an account that accepted the current Terms
		const userId = currentUser(context)
		const termsResponse = toTermsOutdatedResponse(context)
		if (termsResponse || !userId) {
			return termsResponse ?? context.json({ error: "unauthorized" }, 401)
		}

		// post it and say how the post ended
		const commentWriteResult = await postComment({
			userId,
			payload: context.req.valid("json"),
			analyticsProperties: toAnalyticsProperties(context),
		})
		return toCommentWriteResponse(context, commentWriteResult)
	})
	.patch("/comments/:id", toolCallerRateLimiter, zValidator("json", editCommentPayload), async (context) => {
		// an edit is the author's own, inside the comment's edit time
		const userId = currentUser(context)
		const termsResponse = toTermsOutdatedResponse(context)
		if (termsResponse || !userId) {
			return termsResponse ?? context.json({ error: "unauthorized" }, 401)
		}
		const commentWriteResult = await editComment({
			userId,
			commentId: context.req.param("id"),
			body: context.req.valid("json").body,
		})
		return toCommentWriteResponse(context, commentWriteResult)
	})
	.delete("/comments/:id", toolCallerRateLimiter, async (context) => {
		// a delete is the author's, the Topic owner's, or an admin's
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const commentWriteResult = await deleteComment({
			userId,
			commentId: context.req.param("id"),
			analyticsProperties: toAnalyticsProperties(context),
		})
		return toCommentWriteResponse(context, commentWriteResult)
	})
	.get("/usernames", socialReadRateLimiter, zValidator("query", mentionSuggestionsQuery), async (context) => {
		// the suggestions are a signed-in user's alone
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ users: await loadMentionSuggestions(userId, context.req.valid("query").prefix) })
	})

// the response of a post, an edit, or a delete: the comment, or the status that names why nothing was written
function toCommentWriteResponse(context: AppContext, commentWriteResult: CommentWriteResult): Response {
	switch (commentWriteResult.status) {
		// a post or an edit returns the comment with the shared comment slots, and a delete says it is done
		case "saved":
			return context.json({
				comment: commentWriteResult.comment,
				sharedCommentSlots: commentWriteResult.sharedCommentSlots,
			})
		case "deleted":
			return context.json({
				ok: true as const,
				weekCommentCount: commentWriteResult.weekCommentCount,
				commentCount: commentWriteResult.commentCount,
				sharedCommentSlots: commentWriteResult.sharedCommentSlots,
			})
		// a missing comment, and one the user may not change
		case "notFound":
			return context.json({ error: "not found" }, 404)
		// a comment past its edit time, an account past its day's limit, and a chapter the Podcast Episode lacks
		case "locked":
			return context.json({ error: "locked" }, 409)
		case "limitReached":
			return context.json({ error: "rate limited" }, 429)
		case "invalidChapter":
			return context.json({ error: "invalid chapter" }, 400)
		// a body the classification rejected, in Carl's words
		case "objectionable":
			return toObjectionableContentResponse(context, commentWriteResult.category)
	}
}

// the users whose usernames start with a prefix, in name order: each one's id, username, and avatar, and nothing
// else. the user themself and anyone in a user block with them are left out
async function loadMentionSuggestions(
	userId: string,
	prefix: string,
): Promise<{ userId: string; username: string; avatarSource: string | null; avatarVersion: string | null }[]> {
	// a prefix of letters and digits, the only characters a normalized username holds, so it has no like wildcard
	const normalizedPrefix = toNormalizedUsername(prefix).replaceAll(/[^\p{L}\p{N}]/gu, "")
	if (!normalizedPrefix) {
		return []
	}

	// the matching users, in name order
	const userRows = await db
		.select({
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
		.from(users)
		.where(
			and(
				like(users.usernameNormalized, `${normalizedPrefix}%`),
				ne(users.id, userId),
				toNoUserBlockBetweenFilter(userId, users.id),
			),
		)
		.orderBy(users.usernameNormalized)
		.limit(MENTION_SUGGESTION_LIMIT)
	return userRows.map((userRow) => withAvatarVersion(userRow))
}
