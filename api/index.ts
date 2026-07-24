// the api server for the topic feed. the ui calls these routes through a fully typed client.
import { zValidator } from "@hono/zod-validator"
import { consumedPayload, ratingPayload, signupGatePayload } from "@shared/contracts"
import { Hono } from "hono"
import { setCookie } from "hono/cookie"
import { z } from "zod"
import { auth, GATE_COOKIE_MAX_AGE_SECONDS, GATE_COOKIE_NAME, signGateToken, verifyTurnstileToken } from "./auth"
import { type AppEnv, currentUser } from "./currentUser"
import { buildTopicFeeds, recordView, setConsumed, setRating } from "./topicFeed.ts"

// the "All" vs. "Unread" topic finding toggle
const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

// the topic feed routes under /api. AppEnv carries the session user every route resolves through currentUser
const route = new Hono<AppEnv>()
	.basePath("/api")
	// resolves the session once per request so every route below reads it through currentUser
	.use("*", async (context, next) => {
		const session = await auth.api.getSession({ headers: context.req.raw.headers })
		context.set("user", session?.user ?? null)
		await next()
	})
	.on(["POST", "GET"], "/auth/*", (context) => auth.handler(context.req.raw))
	// only the password signup form calls this
	.post("/signup-gate", zValidator("json", signupGatePayload), async (context) => {
		const { turnstileToken } = context.req.valid("json")
		if (!(await verifyTurnstileToken(turnstileToken))) {
			return context.json({ error: "turnstile failed" }, 400)
		}
		// mark turnstile checked with a short-lived cookie. create.before reads it once signup actually completes
		setCookie(context, GATE_COOKIE_NAME, await signGateToken(), {
			httpOnly: true,
			sameSite: "Lax",
			maxAge: GATE_COOKIE_MAX_AGE_SECONDS,
			path: "/",
		})
		return context.json({ ok: true })
	})
	// public: a signed-out visitor gets featured and popular, just no "yours". every route below requires a session
	.get("/topic-feed", zValidator("query", topicFeedQuery), async (context) => {
		const userId = currentUser(context)
		// only include consumed topic findings unless the client asks for the "All" view
		const includeConsumed = context.req.valid("query").all === "true"
		return context.json(await buildTopicFeeds(userId, includeConsumed))
	})
	.post("/topic-findings/:id/rating", zValidator("json", ratingPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// rate this topic finding up, down, or clear the rating. only its topic's owner or a subscriber may
		const rated = await setRating(userId, context.req.param("id"), context.req.valid("json").rating)
		return rated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/consume", zValidator("json", consumedPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// mark this topic finding consumed or unread for the current user
		const consumed = await setConsumed(userId, context.req.param("id"), context.req.valid("json").isConsumed)
		return consumed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/view", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// opening a resource records a view on its topic finding and marks the finding consumed
		const viewed = await recordView(userId, context.req.param("id"))
		return viewed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})

// the ui builds its typed client from this definition
export type AppType = typeof route

// in dev this runs on port 3000 and vite forwards /api to it. in prod, one service serves both the ui and the api.
export default { port: 3000, fetch: route.fetch }
