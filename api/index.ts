// the api server for the topic feed and topic pages. the ui calls these routes through a fully typed client.
import { zValidator } from "@hono/zod-validator"
import { signupGatePayload } from "@shared/contracts"
import { reportError, startMonitoring } from "@shared/monitoring"
import { type Context, Hono } from "hono"
import { serveStatic } from "hono/bun"
import { getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { startTelemetry } from "../worker"
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
import { toTopicFeedXml } from "./share/feed"
import { toCachedPreviewPng, toPreviewHtml, toPublicTopicPreview } from "./share/preview"
import { topicAttachmentsRoute } from "./topic/attachments"
import { featuringRoute } from "./topic/featuring"
import { buildTopicFeeds } from "./topic/feeds"
import { findingsRoute } from "./topic/findings"
import { scansRoute } from "./topic/scans"
import { subscriptionsRoute } from "./topic/subscriptions"
import { topicsRoute } from "./topic/topics"
import { invalidUnsubscribePage, unsubscribe, unsubscribedPage } from "./unsubscribe"
import { usernamesRoute } from "./usernames"

// better auth's reset-password endpoint, the one unauthenticated route that sends mail to an address it is given
const PASSWORD_RESET_REQUEST_PATH = "/request-password-reset"

// the "All" vs. "Unread" topic finding toggle
const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

// the app's own origin. a social crawler reading the preview tags and an RSS reader both need absolute urls
function appUrl(): string {
	return Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173"
}

// where build:ui writes the bundle, relative to the repo root the server runs from
const UI_BUNDLE_ROOT = "./ui/dist"

// the topic feed and topic page routes under /api. AppEnv carries the session user every route resolves through currentUser
const route = new Hono<AppEnv>()
	.basePath("/api")
	// resolves the session once per request so every route below reads it through currentUser
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
	// public: the link-preview card a platform fetches. it carries no session, since a crawler has none,
	// so the public check inside toPublicTopicPreview is what keeps a private Topic's title from leaking
	.get("/topics/:id/preview.png", async (context) => {
		const card = await toPublicTopicPreview(context.req.param("id"))
		if (!card) {
			return context.json({ error: "not found" }, 404)
		}
		// rendered once per distinct card and read from storage after
		const { bytes, cacheControl } = await toCachedPreviewPng(card)
		return context.body(bytes as unknown as ArrayBuffer, 200, {
			"Content-Type": "image/png",
			"Cache-Control": cacheControl,
		})
	})
	// the public profile routes
	.route("/", profilesRoute)
	// the username update route
	.route("/", usernamesRoute)
	// the admin console routes
	.route("/", adminRoute)
	.route("/", featuringRoute)

// the ui builds its typed client from this definition
export type AppType = typeof route

// start error monitoring, analytics tracking, and model-call tracing before the api starts serving
// all are no-op without their keys set as environment variables
startMonitoring()
startTelemetry()

// one origin serves the api and the built ui. the /api catch-all is mounted before the app shell, so a missing endpoint responds with JSON not HTML
const app = new Hono()
	// a throw anywhere below is reported and, under /api, answered as json so a fetch client reads an error not a parse failure
	.onError(reportUnhandledError)
	// the platform health check. it sits ahead of the api tree, so it never runs the session lookup
	.get("/api/health", (context) => context.json({ status: "ok" }))
	.route("/", route)
	// an unmatched /api path is an api failure. a fetch client must read a 404, not fail parsing an HTML page
	.all("/api/*", (context) => context.json({ error: "not found" }, 404))
	// a public Topic's RSS feed, appended to the Topic's path instead of under /api
	// it is a document that a user pastes into their feed reader
	.get("/topics/:id/feed.xml", async (context) => {
		const topicFeedXml = await toTopicFeedXml(context.req.param("id"), appUrl())
		if (!topicFeedXml) {
			return context.text("not found", 404)
		}
		return context.body(topicFeedXml, 200, { "Content-Type": "application/rss+xml; charset=utf-8" })
	})
	// a topic's path gets the app shell with its topic-specific preview tags hydrated
	// a crawler runs no script, so the SPA itself can't add the preview tags for social sites
	.get("/topics/:id", async (context, next) => {
		// a failed topic preview tags lookup falls through to the preview tags in the global layout
		try {
			const topicPreview = await toPublicTopicPreview(context.req.param("id"))
			const appShell = Bun.file(`${UI_BUNDLE_ROOT}/index.html`)
			// a private topic, or a dev machine with no bundle built, falls through to the global static preview tags layout
			if (topicPreview && (await appShell.exists())) {
				return context.html(toPreviewHtml(await appShell.text(), topicPreview, appUrl()))
			}
		} catch (error) {
			console.error("topic preview tags skipped", error)
		}
		return next()
	})
	// the bundle itself: hashed assets, the app shell, and whatever vite copied from the public folder
	.on(["GET", "HEAD"], "*", serveStatic({ root: UI_BUNDLE_ROOT, onFound: setBundleCacheControl }))
	// a client-routed path is not a file, so it gets the app shell, and the router resolves it.
	// without a bundle built, this finds nothing and falls through to a 404, which is the normal state in dev
	.on(["GET", "HEAD"], "*", serveStatic({ path: `${UI_BUNDLE_ROOT}/index.html`, onFound: setBundleCacheControl }))

// a hashed filename never changes contents, so it caches for a year. everything else must revalidate to pick up a new bundle
function setBundleCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/assets/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

/**
 * Answer any unhandled throw, reporting a server fault to Sentry and writing json under /api so a fetch client reads
 * an error instead of failing to parse Hono's default text page.
 */
export function reportUnhandledError(error: Error, context: Context): Response {
	// an error carrying its own response is the caller's fault, not the server's. zValidator throws one of these on a
	// malformed body, so answering it here would turn every 400 into a reported 500
	if (error instanceof HTTPException) {
		return error.getResponse()
	}

	// a genuine server fault: record it, then answer in the shape the path's clients parse
	console.error(error)
	reportError(error, "api")
	return context.req.path.startsWith("/api/")
		? context.json({ error: "internal error" }, 500)
		: context.text("Internal Server Error", 500)
}

// in dev this runs on port 3000 and vite forwards /api to it. in prod, one service serves both the ui and the api.
// Bun's 10-second idle default would drop a quiet streaming chat turn, so idleTimeout matches the model timeout
export default { port: 3000, fetch: app.fetch, idleTimeout: 120 }
