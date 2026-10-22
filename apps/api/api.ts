// the JSON endpoints the ui fetches, served under /api by the basePath

import { signupGatePayload } from "@carlnotes/contracts/payloads"
import { toDeviceProperties } from "@carlnotes/contracts/userAgent"
import { cacheJson } from "@carlnotes/db/redis"
import { appUrl } from "@carlnotes/server/appUrl"
import { traceRequestStage } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { isAPIError } from "better-auth/api"
import { Hono } from "hono"
import { except } from "hono/combine"
import { getCookie, setCookie } from "hono/cookie"
import { z } from "zod"
import { activityRoute } from "./activity"
import { adminRoute } from "./admin"
import { auth, MCP_RESOURCE_URL } from "./auth"
import { loadDailyTopicQuota, topicLimit, topicsRemaining } from "./authorization"
import { AVATAR_UPLOAD_PATH, avatarsRoute, TEAM_AVATAR_UPLOAD_PATH } from "./avatarsRoute"
import { billingRoute } from "./billingRoute"
import { defaultBodyLimit } from "./bodyLimit"
import { chatAttachmentsRoute } from "./chat/attachments"
import { toUnseenChatMentionCountKey } from "./chat/mentions"
import { NEW_TOPIC_CHAT_PATH, privateChatRoute, TEAM_CHAT_PATH, TOPIC_CHAT_PATH } from "./chat/privateChat"
import { chatRoomRoute, TEAM_ROOM_PATH, TOPIC_ROOM_PATH } from "./chat/roomRoute"
import { countUnseenChatMentions, loadChatRooms } from "./chat/rooms"
import { VOICE_TRANSCRIPTION_PATH, voiceRoute } from "./chat/voiceRoute"
import { type AppEnv, currentUser } from "./currentUser"
import { renderedCacheHeaders } from "./edgeCache"
import { flagContentRoute } from "./flagContent"
import { invitesRoute, toInviteTarget } from "./invite/invites"
import { receivedInvitesRoute } from "./invite/receivedInvites"
import { userInvitesRoute } from "./invite/userInvites"
import { mcpClientsRoute } from "./mcp/server"
import { noteCommentThreadsRoute } from "./note/noteCommentThreads"
import { NOTE_SYNC_PATH, notesRoute } from "./note/notes"
import { podcastEpisodeSearchRoute } from "./podcast/podcastEpisodeSearch"
import { podcastEpisodesRoute } from "./podcast/podcastEpisodes"
import { podcastFeedsRoute } from "./podcast/podcastFeeds"
import { profilesRoute } from "./profiles"
import { pageHeadRoute } from "./share/pageHead"
import {
	toCachedInvitePreviewPng,
	toCachedProfilePreviewPng,
	toCachedTeamPreviewPng,
	toCachedTopicPreviewPng,
	toPreviewPngResponse,
	toProfilePreview,
	toTeamPreview,
	toTopicPreview,
} from "./share/preview"
import {
	GATE_COOKIE_MAX_AGE_SECONDS,
	GATE_COOKIE_NAME,
	signGateToken,
	verifyGateToken,
	verifyTurnstileToken,
} from "./signupGate"
import { teamsRoute } from "./team/teamsRoute"
import { TOPIC_ATTACHMENT_UPLOAD_PATH, topicAttachmentsRoute } from "./topic/attachments"
import { featuringRoute } from "./topic/featuring"
import { buildTopicFeeds, readVisitorTopicFeeds } from "./topic/feeds"
import { findingsRoute } from "./topic/findings"
import { scansRoute } from "./topic/scans"
import { topicSearchRoute } from "./topic/search"
import { subscriptionsRoute } from "./topic/subscriptions"
import { topicsRoute } from "./topic/topicsRoute"
import {
	confirmUnsubscribePage,
	invalidUnsubscribePage,
	readUnsubscribeTopic,
	unsubscribe,
	unsubscribedPage,
} from "./unsubscribe"
import { usernamesRoute } from "./usernames"
import { usersRoute } from "./users"

// better auth's reset-password endpoint, the one unauthenticated route that sends mail to an address it is given
const PASSWORD_RESET_REQUEST_PATH = "/request-password-reset"

// the mcp plugin's authorize endpoint. it shows the consent page only when the request sends prompt=consent
const MCP_AUTHORIZE_PATH = "/oauth2/authorize"

// how long the unseen chat mention count is served from Redis
const UNSEEN_CHAT_MENTION_COUNT_TTL_MS = 10_000

// the base path that every api route comes after
const API_BASE_PATH = "/api"

// the routes that set their own body limit, for chat turns, chat room posts, a spoken question's recording, uploads,
// and note sync
const OWN_BODY_LIMIT_PATHS = [
	TOPIC_CHAT_PATH,
	TEAM_CHAT_PATH,
	NEW_TOPIC_CHAT_PATH,
	TOPIC_ROOM_PATH,
	TEAM_ROOM_PATH,
	VOICE_TRANSCRIPTION_PATH,
	AVATAR_UPLOAD_PATH,
	TEAM_AVATAR_UPLOAD_PATH,
	TOPIC_ATTACHMENT_UPLOAD_PATH,
	NOTE_SYNC_PATH,
].map((routePath) => `${API_BASE_PATH}${routePath}`)

// the "All" vs. "Unread" topic finding toggle
const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

// the api tree, mounted on the server in api/index.ts
export const apiRoute = new Hono<AppEnv>()
	.basePath(API_BASE_PATH)
	// resolve the session once per request, so every route that the middleware wraps gets the currentUser
	.use("*", async (context, next) => {
		const session = await auth.api.getSession({ headers: context.req.raw.headers }).catch(toSignedOutSession)
		context.set("user", session?.user ?? null)
		await next()
	})
	// bound every body on the routes with no limit of their own
	.use("*", except(OWN_BODY_LIMIT_PATHS, defaultBodyLimit))
	.on(["POST", "GET"], "/auth/*", async (context) => {
		// redirect a form post to authorize to the same request by get, so it goes through the consent page too
		if (context.req.method === "POST" && context.req.path.endsWith(MCP_AUTHORIZE_PATH)) {
			const authorizeUrl = new URL(context.req.url)
			for (const [name, value] of new URLSearchParams(await context.req.text())) {
				authorizeUrl.searchParams.append(name, value)
			}
			return context.redirect(`${authorizeUrl.pathname}${authorizeUrl.search}`, 303)
		}

		// send every mcp authorize request through the consent page, which the client cannot skip. a request that names
		// no resource asks for the MCP server, so its token is the signed one the server verifies
		if (context.req.method === "GET" && context.req.path.endsWith(MCP_AUTHORIZE_PATH)) {
			const authorizeUrl = new URL(context.req.url)
			authorizeUrl.searchParams.set("prompt", "consent")
			if (!authorizeUrl.searchParams.has("resource")) {
				authorizeUrl.searchParams.set("resource", MCP_RESOURCE_URL)
			}
			return auth.handler(new Request(authorizeUrl, context.req.raw))
		}

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
	// the unsubscribe link of a topic-scan email. the signed token in the url is the auth, so no session is needed, and
	// a fetch of the link changes nothing, so a mail provider or a scanner that checks the link unsubscribes nobody
	.get("/unsubscribe", async (context) => {
		const unsubscribeToken = context.req.query("token")
		const topic = await readUnsubscribeTopic(unsubscribeToken)
		return topic
			? context.html(confirmUnsubscribePage(topic, unsubscribeToken ?? "", appUrl()))
			: context.html(invalidUnsubscribePage(appUrl()), 400)
	})
	// the page's button and a provider's RFC 8058 one-click both post here. the one-click sends the List-Unsubscribe
	// form field and gets 200 with no body, and the button gets the confirmation page
	.post("/unsubscribe", async (context) => {
		const formBody = await context.req.parseBody()
		const isOneClick = formBody["List-Unsubscribe"] === "One-Click"
		const topic = await unsubscribe(context.req.query("token"), {
			entryPoint: isOneClick ? "one-click" : "page",
			deviceProperties: toDeviceProperties(context.req.header("user-agent")),
		})
		if (isOneClick) {
			return context.body(null, 200)
		}
		return topic ? context.html(unsubscribedPage(topic, appUrl())) : context.html(invalidUnsubscribePage(appUrl()), 400)
	})
	// every chat room the user may open, for the chat panel that the app shell mounts once
	.get("/rooms", async (context) => {
		const userId = currentUser(context)
		return context.json({ rooms: userId ? await loadChatRooms(userId) : [] })
	})
	// the unseen chat mention count alone, from one indexed select that Redis caches briefly
	.get("/rooms/mention-count", async (context) => {
		const userId = currentUser(context)
		const unseenChatMentionCount = userId
			? await cacheJson({
					key: toUnseenChatMentionCountKey(userId),
					ttlMs: UNSEEN_CHAT_MENTION_COUNT_TTL_MS,
					load: () => countUnseenChatMentions(userId),
				})
			: 0
		return context.json({ count: unseenChatMentionCount })
	})
	// public: a signed-out visitor gets featured and popular, just no "yours"
	.get("/topic-feed", renderedCacheHeaders, zValidator("query", topicFeedQuery), async (context) => {
		const userId = currentUser(context)
		// only include consumed topic findings unless the api client asks for the "All" view
		const includeConsumed = context.req.valid("query").all === "true"
		// merge in the topic-creation quota. a signed-out visitor has none so gets zero, and every visitor shares one
		// feed, read through Redis for half a minute
		const [topicFeeds, remainingNewTopics, ownedTopicLimit, dailyTopicQuota] = await Promise.all([
			traceRequestStage("topic_feed.build", () =>
				userId ? buildTopicFeeds(userId, includeConsumed) : readVisitorTopicFeeds(includeConsumed),
			),
			userId ? topicsRemaining(userId) : Promise.resolve(0),
			userId ? topicLimit(userId) : Promise.resolve(0),
			userId ? loadDailyTopicQuota(userId) : Promise.resolve({ limit: 0, remainingTopics: 0 }),
		])
		return context.json({
			...topicFeeds,
			topicsRemaining: remainingNewTopics,
			topicLimit: ownedTopicLimit,
			dailyTopicLimit: dailyTopicQuota.limit,
			dailyTopicsRemaining: dailyTopicQuota.remainingTopics,
		})
	})
	// the topic routes
	.route("/", topicSearchRoute)
	.route("/", topicsRoute)
	// the flag content route
	.route("/", flagContentRoute)
	// the topic finding routes
	.route("/", findingsRoute)
	// the manual scan route
	.route("/", scansRoute)
	// the podcast episode search ahead of the podcast episode routes, so /episodes/search is never read as an episode id,
	// then the podcast feed and cover routes
	.route("/", podcastEpisodeSearchRoute)
	.route("/", podcastEpisodesRoute)
	.route("/", podcastFeedsRoute)
	// the chat routes
	.route("/", privateChatRoute)
	// the team chat routes
	.route("/", chatRoomRoute)
	// the voice routes: a spoken question's transcription, a reply's speech, and the spoken events
	.route("/", voiceRoute)
	// the note routes and their comment threads
	.route("/", notesRoute)
	.route("/", noteCommentThreadsRoute)
	// the kept chat attachment routes
	.route("/", chatAttachmentsRoute)
	// the subscription routes
	.route("/", subscriptionsRoute)
	// creating, revoking, and accepting invite links
	.route("/", invitesRoute)
	// the user-invite routes, and the routes that answer an invitation received
	.route("/", userInvitesRoute)
	.route("/", receivedInvitesRoute)
	// the team routes
	.route("/", teamsRoute)
	// the activity page route
	.route("/", activityRoute)
	// the topic attachment routes
	.route("/", topicAttachmentsRoute)
	// the billing routes and the stripe webhook
	.route("/", billingRoute)
	// the avatar routes
	.route("/", avatarsRoute)
	// the page head routes
	.route("/", pageHeadRoute)
	// the link-preview card that a social platform fetches for topic links
	.get("/topics/:id/preview.png", async (context) => {
		const topicPreviewCard = await toTopicPreview(context.req.param("id"))
		if (!topicPreviewCard) {
			return context.json({ error: "not found" }, 404)
		}
		// name the topic this card shows, for the bot analytics
		context.set("analyticsTopic", {
			topicId: topicPreviewCard.topicId,
			isPublic: topicPreviewCard.visibility === "public",
		})
		return toPreviewPngResponse(context, await toCachedTopicPreviewPng(topicPreviewCard))
	})
	// the link-preview card that a social platform fetches for profile links
	.get("/profiles/:userId/preview.png", async (context) => {
		const profilePreviewCard = await toProfilePreview(context.req.param("userId"))
		if (!profilePreviewCard) {
			return context.json({ error: "not found" }, 404)
		}
		return toPreviewPngResponse(context, await toCachedProfilePreviewPng(profilePreviewCard))
	})
	// the link-preview card that a social platform fetches for team links
	.get("/teams/:teamId/preview.png", async (context) => {
		const teamPreviewCard = await toTeamPreview(context.req.param("teamId"))
		if (!teamPreviewCard) {
			return context.json({ error: "not found" }, 404)
		}
		return toPreviewPngResponse(context, await toCachedTeamPreviewPng(teamPreviewCard))
	})
	// the card an invitation shows, addressed by its token so a private team still gets one.
	// the token already opens the team, so its card discloses less than the link it came on
	.get("/invites/:token/preview.png", async (context) => {
		const inviteTarget = await toInviteTarget(context.req.param("token"))
		if (!inviteTarget) {
			return context.json({ error: "not found" }, 404)
		}

		// the token's target, a team or a topic, decides which card is rendered, at any visibility
		const invitePreviewPng = await toCachedInvitePreviewPng(inviteTarget)
		if (!invitePreviewPng) {
			return context.json({ error: "not found" }, 404)
		}
		return toPreviewPngResponse(context, invitePreviewPng)
	})
	// the public profile routes
	.route("/", profilesRoute)
	// the username update route
	.route("/", usernamesRoute)
	// closing an account, by an admin or by its own user
	.route("/", usersRoute)
	// the mcp client name route
	.route("/", mcpClientsRoute)
	// the admin console routes
	.route("/", adminRoute)
	.route("/", featuringRoute)

// a session read that Better Auth rejects as unauthorized reads as signed out. the session's Postgres row is gone.
// any other failure still fails the request
function toSignedOutSession(error: unknown): null {
	if (isAPIError(error) && error.statusCode === 401) {
		return null
	}
	throw error
}
