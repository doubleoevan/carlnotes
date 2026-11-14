// the routes the day's opener is read from: the signed-in home's own, and a person's as an admin reads it

import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { readUpdatesOpener } from "./updates"
import { readStoredUpdatesOpener } from "./updatesOpener"

/**
 * The updates routes: the day's opener on its own, which marks no Finding read, and a person's stored opener for an
 * admin, which writes nothing. The list itself is built for the `read_updates` tool.
 */
export const updatesRoute = new Hono<AppEnv>()
	.get("/updates/opener", toolCallerRateLimiter, async (context) => {
		// the opener is written for an account
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read your updates." }, 401)
		}
		return context.json({ opener: await readUpdatesOpener(userId) })
	})
	.get("/profiles/:userId/opener", toolCallerRateLimiter, async (context) => {
		// only an admin reads another person's opener
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read an opener." }, 401)
		}
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "Only an admin reads another person's opener." }, 403)
		}

		// the cache alone, so no model call runs on the person's budget
		return context.json({ opener: await readStoredUpdatesOpener(context.req.param("userId")) })
	})
