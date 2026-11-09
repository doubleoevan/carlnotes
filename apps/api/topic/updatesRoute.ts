// the route a signed-in client requests an updates list from

import { updatesPayload } from "@carlnotes/contracts/updates"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { buildUpdates } from "./updates"

/**
 * The updates route. A list consumes its Findings, so the route is a POST.
 */
export const updatesRoute = new Hono<AppEnv>().post(
	"/updates",
	toolCallerRateLimiter,
	zValidator("json", updatesPayload),
	async (context) => {
		// a list needs an account, and a request without a session writes nothing
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read your updates." }, 401)
		}

		// a Topic the user may not read looks like a missing one
		const { minutes, topicId } = context.req.valid("json")
		const updates = await buildUpdates({
			userId,
			minutes,
			topicId: topicId ?? null,
			analyticsProperties: toAnalyticsProperties(context),
		})
		return updates ? context.json(updates) : context.json({ error: "No readable topic has that id." }, 404)
	},
)
