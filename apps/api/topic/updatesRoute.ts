// the routes the day's opener is read from: the signed-in home's own, and a person's as an admin reads it

import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { readProfileUpdatesOpener, readUpdatesOpener } from "./updates"

/**
 * The updates routes: the day's opener on its own, and a person's opener for an admin. Neither marks a Finding read.
 * The list itself is built for the `read_updates` tool.
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

		// the opener the person's home shows, written for the person if the day has none
		return context.json({ opener: await readProfileUpdatesOpener(context.req.param("userId")) })
	})
