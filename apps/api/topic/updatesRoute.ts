// the routes the day's recap is read from: the signed-in home's own, and a person's as an admin reads it

import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { readProfileUpdatesRecap, readUpdatesRecap } from "./updates"

/**
 * The updates routes: the day's recap on its own, under its route and its first route, and a person's recap for an
 * admin. None marks a Finding read. The list itself is built for the `read_updates` tool.
 */
export const updatesRoute = new Hono<AppEnv>()
	.get("/updates/recap", toolCallerRateLimiter, async (context) => {
		// the recap is written for an account
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read your updates." }, 401)
		}
		return context.json({ recap: await readUpdatesRecap(userId) })
	})
	// the recap's first route and field, which the 0.1.0 mobile app reads until that release retires
	.get("/updates/opener", toolCallerRateLimiter, async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read your updates." }, 401)
		}
		return context.json({ opener: await readUpdatesRecap(userId) })
	})
	.get("/profiles/:userId/recap", toolCallerRateLimiter, async (context) => {
		// only an admin reads another person's recap
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read a recap." }, 401)
		}
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "Only an admin reads another person's recap." }, 403)
		}

		// the recap the person's home shows, written for the person if the day has none
		return context.json({ recap: await readProfileUpdatesRecap(context.req.param("userId")) })
	})
