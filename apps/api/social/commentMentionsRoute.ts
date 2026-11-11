// the routes a signed-in user reads their unseen Comment Mentions from and marks them seen through

import { commentMentionsSeenPayload } from "@carlnotes/contracts/commentMentions"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { socialReadRateLimiter } from "../rateLimit"
import { loadUnseenCommentMentions, saveSeenCommentMentions } from "./commentMentions"

/**
 * The Comment Mention routes, both under the social read limit. A mention belongs to an account, so both need a
 * session.
 */
export const commentMentionsRoute = new Hono<AppEnv>()
	.get("/comment-mentions/unseen", socialReadRateLimiter, async (context) => {
		// the user's unseen mentions, newest first, from their cached read
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ commentMentions: await loadUnseenCommentMentions(userId) })
	})
	.post(
		"/comment-mentions/seen",
		socialReadRateLimiter,
		zValidator("json", commentMentionsSeenPayload),
		async (context) => {
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}

			// mark the Comments scrolled to, or every unseen mention
			await saveSeenCommentMentions({
				userId,
				payload: context.req.valid("json"),
				analyticsProperties: toAnalyticsProperties(context),
			})
			return context.json({ ok: true as const })
		},
	)
