// the routes that read the news: the signed-in user's own, and a profile's as anyone may read it

import { newsQuery, profileNewsQuery } from "@carlnotes/contracts/news"
import { db } from "@carlnotes/db"
import { users } from "@carlnotes/db/schema/users"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { type AppEnv, currentProfileAudienceUser, currentUser } from "../currentUser"
import { socialReadRateLimiter } from "../rateLimit"
import { readCachedNews } from "./newsCaches"

// what a read with a cursor of another window, or with text that is no cursor, returns
const INVALID_CURSOR_ERROR = { error: "That cursor is not one this window's news returned." }

/**
 * The news routes, both under the social read limit. A profile's news needs no session, and a session that is neither
 * the person's nor an admin's reads what a visitor reads, and so does any read in the visitor audience. A visitor's first
 * page of a window is cached for a minute, and so is a person's own, which their own writes clear. Any other signed-in
 * read is never cached.
 */
export const newsRoute = new Hono<AppEnv>()
	.get("/news", socialReadRateLimiter, zValidator("query", newsQuery), async (context) => {
		// a user's own news needs an account
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read your news." }, 401)
		}
		const news = await readCachedNews({ profileUserId: userId, userId, ...context.req.valid("query") })
		return news ? context.json(news) : context.json(INVALID_CURSOR_ERROR, 400)
	})
	.get("/profiles/:userId/news", socialReadRateLimiter, zValidator("query", profileNewsQuery), async (context) => {
		// a profile nobody has reads as missing
		const [profileUser] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, context.req.param("userId")))
		if (!profileUser) {
			return context.json({ error: "not found" }, 404)
		}

		// the person and an admin read the news whole, and anyone else, or the visitor audience, its public rows
		const { audience, ...newsRead } = context.req.valid("query")
		const userId = currentProfileAudienceUser(context, audience)
		const news = await readCachedNews({ profileUserId: profileUser.id, userId, ...newsRead })
		return news ? context.json(news) : context.json(INVALID_CURSOR_ERROR, 400)
	})
