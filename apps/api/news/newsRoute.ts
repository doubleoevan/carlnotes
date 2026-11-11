// the routes that read the news: the signed-in user's own, and a profile's as anyone may read it

import { newsQuery } from "@carlnotes/contracts/news"
import { db } from "@carlnotes/db"
import { cacheJson } from "@carlnotes/db/redis"
import { users } from "@carlnotes/db/schema/users"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { socialReadRateLimiter } from "../rateLimit"
import { readNews } from "./readNews"

// what a read with a cursor of another window, or with text that is no cursor, returns
const INVALID_CURSOR_ERROR = { error: "That cursor is not one this window's news returned." }

// how long the first page of a profile's news that every visitor shares is cached
const VISITOR_NEWS_TTL_MS = 60_000

/**
 * The news routes, both under the social read limit. A profile's news needs no session, and a session that is not the
 * person's reads what a visitor reads. A visitor's first page of a window is cached for a minute, and a signed-in
 * read is never cached.
 */
export const newsRoute = new Hono<AppEnv>()
	.get("/news", socialReadRateLimiter, zValidator("query", newsQuery), async (context) => {
		// a user's own news needs an account
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "Sign in to read your news." }, 401)
		}
		const news = await readNews({ profileUserId: userId, userId, ...context.req.valid("query") })
		return news ? context.json(news) : context.json(INVALID_CURSOR_ERROR, 400)
	})
	.get("/profiles/:userId/news", socialReadRateLimiter, zValidator("query", newsQuery), async (context) => {
		// a profile nobody has reads as missing
		const [profileUser] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, context.req.param("userId")))
		if (!profileUser) {
			return context.json({ error: "not found" }, 404)
		}

		// the person reads their own news whole, and anyone else its public rows
		const userId = currentUser(context)
		const newsRead = context.req.valid("query")
		const loadNews = (): ReturnType<typeof readNews> => readNews({ profileUserId: profileUser.id, userId, ...newsRead })

		// every visitor shares one first page of a profile's window. a signed-in read and a later page read their own
		const isVisitorFirstPage = userId === null && newsRead.page === 1 && !newsRead.cursor
		const news = isVisitorFirstPage
			? await cacheJson({
					key: `visitor-news:${profileUser.id}:${newsRead.window}`,
					ttlMs: VISITOR_NEWS_TTL_MS,
					load: loadNews,
				})
			: await loadNews()
		return news ? context.json(news) : context.json(INVALID_CURSOR_ERROR, 400)
	})
