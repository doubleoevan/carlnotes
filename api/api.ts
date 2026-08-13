// the JSON endpoints the ui fetches, served under /api by the basePath.
// the ui builds its typed client from this tree, so every route's shape is part of that contract.
import { zValidator } from "@hono/zod-validator"
import { signupGatePayload } from "@shared/contracts"
import { Hono } from "hono"
import { getCookie, setCookie } from "hono/cookie"
import { z } from "zod"
import { activityRoute } from "./activity"
import { adminRoute } from "./admin"
import {
	auth,
	GATE_COOKIE_MAX_AGE_SECONDS,
	GATE_COOKIE_NAME,
	signGateToken,
	verifyGateToken,
	verifyTurnstileToken,
} from "./auth"
import { loadDailyTopicQuota, topicsRemaining } from "./authorization"
import { avatarsRoute } from "./avatars"
import { billingRoute } from "./billing"
import { chatAttachmentsRoute } from "./chat/attachments"
import { chatRoute } from "./chat/turns"
import { type AppEnv, currentUser } from "./currentUser"
import { flagContentRoute } from "./flagContent"
import { profilesRoute } from "./profiles"
import { toCachedProfilePreviewPng, toCachedTopicPreviewPng, toProfilePreview, toTopicPreview } from "./share/preview"
import { topicAttachmentsRoute } from "./topic/attachments"
import { featuringRoute } from "./topic/featuring"
import { buildTopicFeeds } from "./topic/feeds"
import { findingsRoute } from "./topic/findings"
import { scansRoute } from "./topic/scans"
import { subscriptionsRoute } from "./topic/subscriptions"
import { topicsRoute } from "./topic/topics"
import { invalidUnsubscribePage, unsubscribe, unsubscribedPage } from "./unsubscribe"
import { usernamesRoute } from "./usernames"
import { usersRoute } from "./users"

// better auth's reset-password endpoint, the one unauthenticated route that sends mail to an address it is given
const PASSWORD_RESET_REQUEST_PATH = "/request-password-reset"

// the "All" vs. "Unread" topic finding toggle
const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

// the api tree, mounted on the server in api/index.ts
export const apiRoute = new Hono<AppEnv>()
	.basePath("/api")
	// resolves the session once per request, so every route below it gets the currentUser
	.use("*", async (context, next) => {
		const session = await auth.api.getSession({ headers: context.req.raw.headers })
		context.set("user", session?.user ?? null)
		await next()
	})
	.on(["POST", "GET"], "/auth/*", async (context) => {
		// the reset-password request sends mail to any address on demand, so it includes the same turnstile gate that signup does
		if (context.req.path.endsWith(PASSWORD_RESET_REQUEST_PATH)) {
			const gateToken = getCookie(context, GATE_COOKIE_NAME) ?? null
			if (!(gateToken && (await verifyGateToken(gateToken)))) {
				return context.json({ error: "missing or expired turnstile check" }, 400)
			}
		}
		return auth.handler(context.req.raw)
	})
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
	// public one-click unsubscribe from a topic-scan email. the signed token in the link is the auth, so no session is needed
	.get("/unsubscribe", async (context) => {
		// verify the token, drop the direct subscription, and show the result page
		const topic = await unsubscribe(context.req.query("token"))
		const appUrl = Bun.env.BETTER_AUTH_URL
		return topic ? context.html(unsubscribedPage(topic, appUrl)) : context.html(invalidUnsubscribePage(appUrl), 400)
	})
	.post("/unsubscribe", async (context) => {
		// inbox providers post here to comply with RFC 8058 one-click unsubscribe. act on the token and return 200 with no body
		await unsubscribe(context.req.query("token"))
		return context.body(null, 200)
	})
	// public: a signed-out visitor gets featured and popular, just no "yours"
	.get("/topic-feed", zValidator("query", topicFeedQuery), async (context) => {
		const userId = currentUser(context)
		// only include consumed topic findings unless the client asks for the "All" view
		const includeConsumed = context.req.valid("query").all === "true"
		// merge in the topic-creation quota. a signed-out visitor has none so gets zero
		const [topicFeeds, remainingNewTopics, dailyTopicQuota] = await Promise.all([
			buildTopicFeeds(userId, includeConsumed),
			userId ? topicsRemaining(userId) : Promise.resolve(0),
			userId ? loadDailyTopicQuota(userId) : Promise.resolve({ limit: 0, remainingTopics: 0 }),
		])
		return context.json({
			...topicFeeds,
			topicsRemaining: remainingNewTopics,
			dailyTopicLimit: dailyTopicQuota.limit,
			dailyTopicsRemaining: dailyTopicQuota.remainingTopics,
		})
	})
	// the topic routes
	.route("/", topicsRoute)
	// the flag content route
	.route("/", flagContentRoute)
	// the topic finding routes
	.route("/", findingsRoute)
	// the manual scan route
	.route("/", scansRoute)
	// the chat routes
	.route("/", chatRoute)
	// the kept chat attachment routes
	.route("/", chatAttachmentsRoute)
	// the subscription routes
	.route("/", subscriptionsRoute)
	// the activity page route
	.route("/", activityRoute)
	// the topic attachment routes
	.route("/", topicAttachmentsRoute)
	// the billing routes and the stripe webhook
	.route("/", billingRoute)
	// the avatar routes
	.route("/", avatarsRoute)
	// the link-preview card that a social platform fetches for topic links
	.get("/topics/:id/preview.png", async (context) => {
		const topicPreviewCard = await toTopicPreview(context.req.param("id"))
		if (!topicPreviewCard) {
			return context.json({ error: "not found" }, 404)
		}
		// rendered once per distinct card and read from storage after
		const { bytes, cacheControl } = await toCachedTopicPreviewPng(topicPreviewCard)
		return context.body(bytes as unknown as ArrayBuffer, 200, {
			"Content-Type": "image/png",
			"Cache-Control": cacheControl,
		})
	})
	// the link-preview card that a social platform fetches for profile links
	.get("/profiles/:userId/preview.png", async (context) => {
		const profilePreviewCard = await toProfilePreview(context.req.param("userId"))
		if (!profilePreviewCard) {
			return context.json({ error: "not found" }, 404)
		}
		// rendered once per distinct card and read from storage after
		const { bytes, cacheControl } = await toCachedProfilePreviewPng(profilePreviewCard)
		return context.body(bytes as unknown as ArrayBuffer, 200, {
			"Content-Type": "image/png",
			"Cache-Control": cacheControl,
		})
	})
	// the public profile routes
	.route("/", profilesRoute)
	// the username update route
	.route("/", usernamesRoute)
	// closing an account, by an admin or by its own user
	.route("/", usersRoute)
	// the admin console routes
	.route("/", adminRoute)
	.route("/", featuringRoute)
