// the route the signed-in home reads the day's opener from

import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { readUpdatesOpener } from "./updates"

/**
 * The updates route: the day's opener on its own, which marks no Finding read. The list itself is built for the
 * `read_updates` tool.
 */
export const updatesRoute = new Hono<AppEnv>().get("/updates/opener", toolCallerRateLimiter, async (context) => {
	// the opener is written for an account
	const userId = currentUser(context)
	if (!userId) {
		return context.json({ error: "Sign in to read your updates." }, 401)
	}
	return context.json({ opener: await readUpdatesOpener(userId) })
})
