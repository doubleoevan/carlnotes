// the JSON endpoints the ui fetches, served under /api by the basePath

import { signupGatePayload } from "@carlnotes/contracts/payloads"
import { topicFeedQuery } from "@carlnotes/contracts/routeShapes"
import { GATE_COOKIE_NAME } from "@carlnotes/contracts/signupGate"
import { toDeviceProperties } from "@carlnotes/contracts/userAgent"
import { cacheJson } from "@carlnotes/db/redis"
import { appUrl } from "@carlnotes/server/appUrl"
import { zValidator } from "@hono/zod-validator"
import { isAPIError } from "better-auth/api"
import { Hono } from "hono"
import { except } from "hono/combine"
import { getCookie } from "hono/cookie"
import { activityRoute } from "./activity"
import { adminRoute } from "./admin"
import { adminBlocksRoute } from "./adminBlocks"
import { appSignupGateRoute } from "./appSignupGate"
import { auth, MCP_RESOURCE_URL } from "./auth"
import { AVATAR_UPLOAD_PATH, avatarsRoute, TEAM_AVATAR_UPLOAD_PATH } from "./avatarsRoute"
import { billingRoute } from "./billingRoute"
import { defaultBodyLimit } from "./bodyLimit"
import { chatAttachmentsRoute } from "./chat/attachments"
import { toUnseenChatMentionCountKey } from "./chat/mentions"
import { NEW_TOPIC_CHAT_PATH, privateChatRoute, TEAM_CHAT_PATH, TOPIC_CHAT_PATH } from "./chat/privateChat"
import { chatRoomRoute, TEAM_ROOM_PATH, TOPIC_ROOM_PATH } from "./chat/roomRoute"
import { countUnseenChatMentions, loadChatRooms } from "./chat/rooms"
import { VOICE_TRANSCRIPTION_PATH, voiceRoute } from "./chat/voiceRoute"
import { countsRoute } from "./counts/countsRoute"
import { type AppEnv, currentUser } from "./currentUser"
import { dashboardsRoute } from "./dashboard/dashboardsRoute"
import { renderedCacheHeaders } from "./edgeCache"
import { homeRoute } from "./home/homeRoute"
import { invitesRoute, toInviteTarget } from "./invite/invites"
import { receivedInvitesRoute } from "./invite/receivedInvites"
import { userInvitesRoute } from "./invite/userInvites"
import { mcpClientsRoute } from "./mcp/server"
import { newsRoute } from "./news/newsRoute"
import { noteCommentsRoute } from "./note/noteComments"
import { NOTE_BODY_PATH, notesRoute } from "./note/notes"
import { aiAgentAccountsRoute } from "./personalSources/aiAgentAccountsRoute"
import { personalSourcesEmailSetupRoute } from "./personalSources/emailSetupRoute"
import { PERSONAL_SOURCES_IMPORT_PATH, personalSourcesImportsRoute } from "./personalSources/importsRoute"
import { personalSourcesInboundRoute } from "./personalSources/inboundRoute"
import { personalSourcesRoute } from "./personalSources/personalSourcesRoute"
import { personalSourcesSendsRoute } from "./personalSources/sendsRoute"
import { podcastEpisodeHomeOrderRoute } from "./podcast/podcastEpisodeHomeOrder"
import { podcastEpisodeImagesRoute } from "./podcast/podcastEpisodeImagesRoute"
import { podcastEpisodesRoute } from "./podcast/podcastEpisodes"
import { podcastFeedsRoute } from "./podcast/podcastFeeds"
import { topicPodcastEpisodeVideoHomeOrderRoute } from "./podcast/topicPodcastEpisodeVideoHomeOrder"
import { topicPodcastEpisodeVideoImagesRoute } from "./podcast/topicPodcastEpisodeVideoImagesRoute"
import { topicPodcastEpisodeVideosRoute } from "./podcast/topicPodcastEpisodeVideoRoutes"
import { profileOrderRoute } from "./profileOrder"
import { profilesRoute } from "./profiles"
import { pushDevicesRoute } from "./pushDevices"
import { apiRateLimiter, topicFeedRateLimiter } from "./rateLimit"
import { flagContentRoute } from "./report/flagContent"
import { searchRoute } from "./search/search"
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
import { setGateCookie, signGateToken, verifyGateToken, verifyTurnstileToken } from "./signupGate"
import { commentMentionsRoute } from "./social/commentMentionsRoute"
import { commentsRoute } from "./social/commentsRoute"
import { reactionsRoute } from "./social/reactionsRoute"
import { teamsRoute } from "./team/teamsRoute"
import { termsAcceptanceRoute } from "./termsAcceptance"
import { TOPIC_ATTACHMENT_UPLOAD_PATH, topicAttachmentsRoute } from "./topic/attachments"
import { findingsRoute } from "./topic/findings"
import { homeOrderRoute } from "./topic/homeOrder"
import { scansRoute } from "./topic/scans"
import { subscriptionsRoute } from "./topic/subscriptions"
import { loadTopicFeedResponse } from "./topic/topicFeedResponse"
import { topicImagesRoute } from "./topic/topicImagesRoute"
import { topicsRoute } from "./topic/topicsRoute"
import { updatesRoute } from "./topic/updatesRoute"
import { topicPostDiscussionsRoute } from "./topicPost/topicPostDiscussionsRoute"
import { topicPostHomeOrderRoute } from "./topicPost/topicPostHomeOrder"
import { TOPIC_POST_BODY_IMAGE_UPLOAD_PATH, topicPostImagesRoute } from "./topicPost/topicPostImagesRoute"
import { TOPIC_POST_PATH, topicPostsRoute } from "./topicPost/topicPostsRoute"
import {
	confirmUnsubscribePage,
	invalidUnsubscribePage,
	readUnsubscribeEmails,
	unsubscribe,
	unsubscribedPage,
} from "./unsubscribe"
import { userBlocksRoute } from "./userBlocks"
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
// and the note body save
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
	NOTE_BODY_PATH,
	TOPIC_POST_PATH,
	TOPIC_POST_BODY_IMAGE_UPLOAD_PATH,
	PERSONAL_SOURCES_IMPORT_PATH,
].map((routePath) => `${API_BASE_PATH}${routePath}`)

// the api tree, mounted on the server in api/index.ts
export const apiRoute = new Hono<AppEnv>()
	.basePath(API_BASE_PATH)
	// a url with a NUL byte names nothing, and Postgres text rejects one
	.use("*", async (context, next) => {
		if (context.req.url.includes("%00")) {
			return context.json({ error: "invalid url" }, 400)
		}
		await next()
	})
	// resolve the session once per request, so every route that the middleware wraps gets the currentUser
	.use("*", async (context, next) => {
		const session = await auth.api.getSession({ headers: context.req.raw.headers }).catch(toSignedOutSession)
		context.set("user", session?.user ?? null)
		context.set("sessionId", session?.session.id ?? null)
		await next()
	})
	// count every request but the exempt paths against the general limit, by the user else the address
	.use("*", apiRateLimiter)
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
		setGateCookie(context, await signGateToken())
		return context.json({ ok: true })
	})
	// the app's gate beside it, which sets the same cookie from device attestation
	.route("/", appSignupGateRoute)
	.route("/", personalSourcesRoute)
	.route("/", personalSourcesImportsRoute)
	.route("/", aiAgentAccountsRoute)
	.route("/", personalSourcesSendsRoute)
	.route("/", personalSourcesEmailSetupRoute)
	.route("/", personalSourcesInboundRoute)
	// the unsubscribe link of a topic scan email or a notifications email. the signed token in the url is the auth, so
	// no session is needed, and a fetch of the link changes nothing, so a mail provider or a scanner that checks the link
	// unsubscribes nobody
	.get("/unsubscribe", async (context) => {
		const unsubscribeToken = context.req.query("token")
		const unsubscribeEmails = await readUnsubscribeEmails(unsubscribeToken)
		return unsubscribeEmails
			? context.html(confirmUnsubscribePage(unsubscribeEmails, unsubscribeToken ?? "", appUrl()))
			: context.html(invalidUnsubscribePage(appUrl()), 400)
	})
	// the page's button and a provider's RFC 8058 one-click both post here. the one-click sends the List-Unsubscribe
	// form field and gets 200 with no body, and the button gets the confirmation page
	.post("/unsubscribe", async (context) => {
		const formBody = await context.req.parseBody()
		const isOneClick = formBody["List-Unsubscribe"] === "One-Click"
		const unsubscribedEmails = await unsubscribe(context.req.query("token"), {
			entryPoint: isOneClick ? "one-click" : "page",
			deviceProperties: toDeviceProperties(context.req.header("user-agent")),
		})
		if (isOneClick) {
			return context.body(null, 200)
		}
		return unsubscribedEmails
			? context.html(unsubscribedPage(unsubscribedEmails, appUrl()))
			: context.html(invalidUnsubscribePage(appUrl()), 400)
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
	// public: a signed-out visitor gets home and popular, just no "yours"
	.get(
		"/topic-feed",
		topicFeedRateLimiter,
		renderedCacheHeaders,
		zValidator("query", topicFeedQuery),
		async (context) => {
			// only include consumed topic findings unless the api client asks for the "All" view
			const isConsumedIncluded = context.req.valid("query").all === "true"
			return context.json(await loadTopicFeedResponse(currentUser(context), isConsumedIncluded))
		},
	)
	// the site search, then the topic routes
	.route("/", searchRoute)
	.route("/", topicsRoute)
	.route("/", topicImagesRoute)
	.route("/", podcastEpisodeImagesRoute)
	.route("/", homeRoute)
	.route("/", podcastEpisodeHomeOrderRoute)
	.route("/", topicPodcastEpisodeVideoHomeOrderRoute)
	.route("/", topicPostHomeOrderRoute)
	// a topic's, a podcast episode's, and a Topic Post's place among the pins of their person's profile
	.route("/", profileOrderRoute)
	// a topic page's view, and the counts the topic and podcast episode pages read
	.route("/", countsRoute)
	// the Dashboard pages' snapshots and share images
	.route("/", dashboardsRoute)
	// the flag content route
	.route("/", flagContentRoute)
	// the topic finding routes
	.route("/", findingsRoute)
	// the manual scan route
	.route("/", scansRoute)
	// the updates list and the day's opener
	.route("/", updatesRoute)
	// the news: the user's own, and a profile's
	.route("/", newsRoute)
	// the podcast episode routes, then the podcast feed and cover routes
	.route("/", podcastEpisodesRoute)
	.route("/", topicPodcastEpisodeVideosRoute)
	.route("/", topicPodcastEpisodeVideoImagesRoute)
	.route("/", podcastFeedsRoute)
	// the chat routes
	.route("/", privateChatRoute)
	// the team chat routes
	.route("/", chatRoomRoute)
	// the voice routes: a spoken question's transcription, a reply's speech, and the spoken events
	.route("/", voiceRoute)
	// the note routes and their comment threads
	.route("/", notesRoute)
	.route("/", noteCommentsRoute)
	// reactions, comment threads, and the mention suggestions
	.route("/", reactionsRoute)
	.route("/", commentsRoute)
	// a user's unseen comment mentions, and the mark that they saw them
	.route("/", commentMentionsRoute)
	// a topic's posts: their drafts, their publish, and their pages
	.route("/", topicPostsRoute)
	.route("/", topicPostImagesRoute)
	.route("/", topicPostDiscussionsRoute)
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
	// user blocks: blocking a user, unblocking them, and the list
	.route("/", userBlocksRoute)
	// registering a phone for push notifications, unregistering it, and the push preferences
	.route("/", pushDevicesRoute)
	// accepting the published Terms
	.route("/", termsAcceptanceRoute)
	// the mcp client name route
	.route("/", mcpClientsRoute)
	// the admin console routes
	.route("/", adminRoute)
	.route("/", adminBlocksRoute)
	.route("/", homeOrderRoute)

// a session read that Better Auth rejects as unauthorized reads as signed out. the session's Postgres row is gone.
// any other failure still fails the request
function toSignedOutSession(error: unknown): null {
	if (isAPIError(error) && error.statusCode === 401) {
		return null
	}
	throw error
}
