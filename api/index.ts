// the api server for the topic feed and topic pages. the ui calls these routes through a fully typed client.
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import {
	attachmentContextPayload,
	attachmentUrlPayload,
	bookmarkPayload,
	budgetOverridePayload,
	type ChatAttachment,
	type ChatConversation,
	chatTurnPayload,
	checkoutPayload,
	consumedPayload,
	inviteRevokePayload,
	ratingPayload,
	setRolePayload,
	signupGatePayload,
	subscriptionEmailPayload,
	subscriptionPayload,
	suggestSourcesPayload,
	topicFeatureOrderPayload,
	updateTopicPayload,
	withAttachmentNote,
} from "@shared/contracts"
import { reportError, startMonitoring } from "@shared/monitoring"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { serveStatic } from "hono/bun"
import { setCookie } from "hono/cookie"
import { stream } from "hono/streaming"
import { z } from "zod"
import {
	AttachmentValidationError,
	attachmentStream,
	type ChatReplyStream,
	ingestAttachment,
	ingestUrlAttachment,
	MAX_ATTACHMENT_BYTES,
	startTelemetry,
	streamChatReply,
	suggestSources,
} from "../worker"
import { loadActivity } from "./activity"
import { loadAdminTotals, loadAdminUsers, loadAdminUserTopics, setUserBudgetOverride, setUserRole } from "./admin"
import { auth, GATE_COOKIE_MAX_AGE_SECONDS, GATE_COOKIE_NAME, signGateToken, verifyTurnstileToken } from "./auth"
import { isAllowed, loadDailyTopicQuota, topicsRemaining } from "./authorization"
import { createCheckoutSession, createPortalSession, handleStripeWebhook, loadBillingState } from "./billing"
import {
	deleteKeptAttachment,
	keepChatAttachments,
	loadDownloadableKeptAttachment,
	loadKeptAttachments,
	resolveChatAttachments,
} from "./chat/attachments"
import { authorizeChatTurn, clearChatTurns, loadChatTurns, recordChatTurn } from "./chat/turns"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "./currentUser"
import { deleteTopicAttachment, loadDownloadableAttachment, updateTopicAttachmentContext } from "./topic/attachments"
import { setTopicFeatureOrder } from "./topic/featuring"
import { buildTopicFeeds } from "./topic/feeds"
import { recordView, setBookmarked, setConsumed, setRating } from "./topic/findings"
import { loadOwnedTopic } from "./topic/permissions"
import { runManualScan } from "./topic/scans"
import {
	deleteTopicInvite,
	deleteTopicSubscription,
	setSubscriptionEmailEnabled,
	setTopicSubscription,
} from "./topic/subscriptions"
import { createTopic, deleteTopic, loadTopicPayload, updateTopic } from "./topic/topics"
import { invalidUnsubscribePage, unsubscribe, unsubscribedPage } from "./unsubscribe"

// the "All" vs. "Unread" topic finding toggle
const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

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
	// public: a signed-out visitor gets featured and popular, just no "yours". every route below requires a session
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
	.post("/topics", zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a topic for the current user within the topic cap and the daily topic limit
		const createTopicResult = await createTopic(userId, context.req.valid("json"), toAnalyticsProperties(context))
		if (createTopicResult.status === "created") {
			return context.json({ id: createTopicResult.id })
		}

		// a full topic cap and a full daily topic limit both reject, but only the second can name its number
		return createTopicResult.status === "dailyFrequency"
			? context.json({ error: "daily topic limit reached", dailyTopicLimit: createTopicResult.limit }, 429)
			: context.json({ error: "quota exhausted" }, 429)
	})
	.post("/topics/suggest-sources", zValidator("json", suggestSourcesPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// propose sources from the topic's own text. suggesting is not scanning, so it draws on no quota
		const { name, prompt, attachmentContext, excludeSources, limit } = context.req.valid("json")
		return context.json({ sources: await suggestSources({ name, prompt, attachmentContext, excludeSources, limit }) })
	})
	.post("/topic-findings/:id/rating", zValidator("json", ratingPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// rate this topic finding up, down, or clear the rating
		const rating = context.req.valid("json").rating
		const isRated = await setRating(userId, context.req.param("id"), rating, toAnalyticsProperties(context))
		return isRated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/consume", zValidator("json", consumedPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// mark this topic finding consumed or unread for the current user
		const { isConsumed: isMarkedConsumed } = context.req.valid("json")
		const isConsumed = await setConsumed(
			userId,
			context.req.param("id"),
			isMarkedConsumed,
			toAnalyticsProperties(context),
		)
		return isConsumed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/bookmark", zValidator("json", bookmarkPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// bookmark or unbookmark this topic finding for the current user, keeping the count below the max results
		const { isBookmarked } = context.req.valid("json")
		const isBookmarkSet = await setBookmarked(
			userId,
			context.req.param("id"),
			isBookmarked,
			toAnalyticsProperties(context),
		)
		return isBookmarkSet ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/view", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// opening a resource records a view on its topic finding and marks the finding consumed
		const isViewed = await recordView(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isViewed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.get("/topics/:id", async (context) => {
		// the topic detail payload, gated by visibility. a signed-out visitor may only view a public topic
		const topicPayload = await loadTopicPayload(currentUser(context), context.req.param("id"))
		return topicPayload ? context.json(topicPayload) : context.json({ error: "not found" }, 404)
	})
	.patch("/topics/:id", zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// save the edit topic's fields and reconcile the invitee and source lists. owner or admin only.
		const updateTopicResult = await updateTopic(
			userId,
			context.req.param("id"),
			context.req.valid("json"),
			toAnalyticsProperties(context),
		)
		if (updateTopicResult.status === "saved") {
			return context.json({ ok: true })
		}

		// a daily frequency past the plan's limit is a quota rejection, not an authorization one
		return updateTopicResult.status === "dailyFrequency"
			? context.json({ error: "daily topic limit reached", dailyTopicLimit: updateTopicResult.limit }, 429)
			: context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// delete the topic and everything attached to it. owner or admin only.
		const isTopicDeleted = await deleteTopic(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isTopicDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topics/:id/scan", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// trigger a manual scan, billed as overage past the daily quota when a card is on file. owner or admin only.
		const scanResult = await runManualScan(userId, context.req.param("id"), toAnalyticsProperties(context))
		if (scanResult.status === "started") {
			return context.json({ remainingScans: scanResult.remainingScans })
		}

		// a scan already in flight is a conflict, not a quota or authorization failure
		if (scanResult.status === "running") {
			return context.json({ error: "a scan is already running" }, 409)
		}

		// an exhausted quota and a non-owner topic scan fail differently, so the ui should tell them apart
		return scanResult.status === "quota"
			? context.json({ error: "quota exhausted" }, 429)
			: context.json({ error: "forbidden" }, 403)
	})
	.get("/topics/:id/chat", async (context) => {
		// what the panel opens with. the caller's stored conversation, what they have kept, and whether they may chat
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const [chatTurns, authorization, keptAttachments] = await Promise.all([
			loadChatTurns(userId, topicId),
			authorizeChatTurn(userId, topicId),
			loadKeptAttachments(userId, topicId),
		])

		// the payload the chat panel renders from
		const chatConversation: ChatConversation = {
			chatTurns,
			canChat: authorization.status === "allowed",
			isSignupRequired: authorization.status === "signup",
			isBudgetExhausted: authorization.status === "budget",
			keptAttachments,
		}
		return context.json(chatConversation)
	})
	.delete("/topics/:id/chat", async (context) => {
		// clearing a chat wipes the chat owner's conversation text while the spend rows stay
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		await clearChatTurns(userId, context.req.param("id"))
		return context.json({ ok: true })
	})
	.delete("/chat-attachments/:id", async (context) => {
		// deleting a kept attachment is signed-in only and scoped to its keeper, freeing its cap slot
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		const isDeleted = await deleteKeptAttachment(userId, context.req.param("id"))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.get("/chat-attachments/:id/download", async (context) => {
		// downloading a kept attachment is signed-in only and scoped to its keeper
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const keptAttachment = await loadDownloadableKeptAttachment(userId, context.req.param("id"))
		if (!keptAttachment) {
			return context.json({ error: "not found" }, 404)
		}

		// kept text has no stored file, so its words download back directly
		if (keptAttachment.kind === "text") {
			return context.body(keptAttachment.text, 200, toDownloadHeaders(keptAttachment.name, "text/plain; charset=utf-8"))
		}
		return context.body(
			attachmentStream(keptAttachment.objectKey),
			200,
			toDownloadHeaders(keptAttachment.name, keptAttachment.contentType),
		)
	})
	.post(
		"/topics/:id/chat",
		// cap the chat turn body before json parsing buffers it. four data-url images at their contract cap, with room to spare
		bodyLimit({
			maxSize: 26 * 1024 * 1024,
			onError: (context) => context.json({ error: "Those attachments are too large." }, 413),
		}),
		zValidator("json", chatTurnPayload),
		async (context) => {
			// authorize the chat turn first. each rejection reads differently to the user, so each gets its own status
			const userId = currentUser(context)
			const topicId = context.req.param("id")
			const { question, history, attachments } = context.req.valid("json")
			const authorization = await authorizeChatTurn(userId, topicId)

			// an exhausted budget prompts an upgrade
			if (authorization.status === "budget") {
				if (userId) {
					trackEvent("chat_budget_reached", userId, { ...toAnalyticsProperties(context), topicId })
				}
				return context.json({ error: "budget exhausted" }, 402)
			}
			// a signed-out caller is sent to signup instead
			if (authorization.status === "signup") {
				return context.json({ error: "sign up required" }, 401)
			}
			// anything left is a visibility rejection
			if (authorization.status !== "allowed") {
				return context.json({ error: "forbidden" }, 403)
			}
			// the gate already rejected a signed-out caller with "signup", so this narrows the type alone
			if (!userId) {
				return context.json({ error: "sign up required" }, 401)
			}

			// a PDF attachment becomes its extracted text here, and an unreadable one rejects the chat turn in words
			const resolvedAttachments = await resolveChatAttachments(attachments)
			if (resolvedAttachments === null) {
				return context.json({ error: "That PDF couldn't be read." }, 422)
			}

			// stream a chat reply against the topic's own material
			const chatReply = await streamChatReply({
				topicId,
				question,
				history,
				attachments: resolvedAttachments,
				userId,
				isOwner: authorization.isOwner,
				litellmApiKey: authorization.litellmApiKey,
			})
			if (!chatReply) {
				return context.json({ error: "not found" }, 404)
			}
			// the stored question names its attachments, since the attachments themselves are sent only to the model
			return streamChatTurn(context, chatReply, {
				userId,
				topicId,
				question: withAttachmentNote(question, attachments),
				isPersisted: authorization.isPersisted,
				attachments,
				litellmApiKey: authorization.litellmApiKey,
				analyticsProperties: toAnalyticsProperties(context),
			})
		},
	)
	.post("/topics/:id/subscription", zValidator("json", subscriptionPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// subscribe, reactivate, or deactivate the current user's subscription to a public or invite topic
		const { isSubscribed } = context.req.valid("json")
		const isSubscriptionSet = await setTopicSubscription(userId, context.req.param("id"), isSubscribed)
		return isSubscriptionSet ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id/subscription", async (context) => {
		// reject a signed-out caller
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// permanently remove the caller's own subscription row and their invite, distinct from deactivating it.
		await deleteTopicSubscription(user.id, user.email, context.req.param("id"))
		return context.json({ ok: true })
	})
	.delete("/topics/:id/invite", zValidator("json", inviteRevokePayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// withdraw an invitation on the caller's own topic, dropping that invitee's subscription with it. owner only
		const isRevoked = await deleteTopicInvite(userId, context.req.param("id"), context.req.valid("json").email)
		return isRevoked ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topics/:id/subscription-email", zValidator("json", subscriptionEmailPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// turn the caller's email preference for this subscription on or off
		await setSubscriptionEmailEnabled(userId, context.req.param("id"), context.req.valid("json").isEmailEnabled)
		return context.json({ ok: true })
	})
	.get("/activity", async (context) => {
		// reject a signed-out caller
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// return the caller's own spend, topics, subscriptions, and invites
		return context.json(await loadActivity({ id: user.id, email: user.email }))
	})
	.post(
		"/topics/:id/attachments",
		// cap the upload body before it's fully buffered into memory. the multipart envelope adds a little over the file limit,
		// and ingestAttachment re-checks the exact per-file limit on the decoded bytes
		bodyLimit({
			maxSize: MAX_ATTACHMENT_BYTES + 1024 * 1024,
			onError: (context) => context.json({ error: "That attachment is too large. The limit is 10 MB." }, 413),
		}),
		async (context) => {
			// reject a signed-out caller
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}

			// check the owner first, so a stranger's upload does no storage or model work
			if (!(await loadOwnedTopic(userId, context.req.param("id")))) {
				return context.json({ error: "forbidden" }, 403)
			}

			// read the multipart file field
			const body = await context.req.parseBody()
			const file = body.file
			if (!(file instanceof File)) {
				return context.json({ error: "file field required" }, 400)
			}

			// run the synchronous part of attachment ingestion:
			// size and type validation, object storage, a pending row, and starting the processing workflow
			try {
				const bytes = new Uint8Array(await file.arrayBuffer())
				const attachment = await ingestAttachment({
					topicId: context.req.param("id"),
					filename: file.name,
					contentType: file.type,
					bytes,
				})

				// hand the persisted attachment identity back to the modal
				return context.json({ id: attachment.id, filename: attachment.filename })
			} catch (error) {
				// a validation error names the user's own mistake, so it shows verbatim.
				// anything else is internal: log the real cause and keep it out of the response
				if (error instanceof AttachmentValidationError) {
					return context.json({ error: error.message }, 400)
				}
				console.error(`attachment ingestion failed for topic ${context.req.param("id")}`, error)
				return context.json({ error: "Carl couldn't process that attachment. Try again in a moment." }, 502)
			}
		},
	)
	.post("/topics/:id/attachments/url", zValidator("json", attachmentUrlPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// check the owner first, so a stranger's url is never fetched
		if (!(await loadOwnedTopic(userId, context.req.param("id")))) {
			return context.json({ error: "forbidden" }, 403)
		}

		// fetch the page and hand its markdown to the same ingestion path a file upload takes
		try {
			const { url } = context.req.valid("json")
			const attachment = await ingestUrlAttachment(context.req.param("id"), url)
			return context.json({ id: attachment.id, filename: attachment.filename })
		} catch (error) {
			// a validation error names the caller's own url, so it shows verbatim. anything else is internal
			if (error instanceof AttachmentValidationError) {
				return context.json({ error: error.message }, 400)
			}
			console.error(`url attachment ingestion failed for topic ${context.req.param("id")}`, error)
			return context.json({ error: "Carl couldn't process that link. Try again in a moment." }, 502)
		}
	})
	.patch("/attachments/:id/context", zValidator("json", attachmentContextPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// replace the previously saved attachment context
		const isContextUpdated = await updateTopicAttachmentContext(
			userId,
			context.req.param("id"),
			context.req.valid("json").context,
		)
		return isContextUpdated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.delete("/attachments/:id", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// remove an attachment row and its stored object best-effort. owner only
		const isDeleted = await deleteTopicAttachment(userId, context.req.param("id"))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.get("/attachments/:id/download", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// stream the stored object with its original name. owner only
		const attachment = await loadDownloadableAttachment(userId, context.req.param("id"))
		if (!attachment) {
			return context.json({ error: "not found" }, 404)
		}

		return context.body(
			attachmentStream(attachment.objectKey),
			200,
			toDownloadHeaders(attachment.filename, attachment.contentType),
		)
	})
	.post("/billing/checkout", zValidator("json", checkoutPayload), async (context) => {
		// reject a signed-out caller
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// open a stripe checkout session for the chosen plan and billing interval, and hand its url back to redirect to
		const { plan, billingInterval } = context.req.valid("json")
		const url = await createCheckoutSession(user.id, user.email, plan, billingInterval)
		return context.json({ url })
	})
	.post("/billing/portal", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// open the stripe customer portal, or 404 when the user has no active subscription to manage
		const url = await createPortalSession(userId)
		return url ? context.json({ url }) : context.json({ error: "no subscription" }, 404)
	})
	.get("/billing/state", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the account page's plan, daily scan usage, card-on-file, and payment status
		return context.json(await loadBillingState(userId))
	})
	.post("/webhooks/stripe", async (context) => {
		// verify and apply the stripe event from the raw body. a bad signature responds with a 400 so stripe retries
		try {
			await handleStripeWebhook(await context.req.text(), context.req.header("stripe-signature"))
			return context.json({ received: true })
		} catch (error) {
			console.error("stripe webhook rejected", error)
			return context.json({ error: "invalid webhook" }, 400)
		}
	})
	// the admin console routes
	.get("/admin/console", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the users table and the totals summary, admin only.
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const users = await loadAdminUsers()
		const totals = await loadAdminTotals(users)
		return context.json({ users, totals })
	})
	.patch("/topics/:id/feature-order", zValidator("json", topicFeatureOrderPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// updating the Featured section is admin only
		if (!(await isAllowed(userId, "admin:setFeatureOrder"))) {
			return context.json({ error: "forbidden" }, 403)
		}

		// position zero clears the topic's order. any other position inserts it and shifts the rest.
		// a topic that isn't public is rejected
		const featureOrderResult = await setTopicFeatureOrder(context.req.param("id"), context.req.valid("json").position)
		if (featureOrderResult === "missing") {
			return context.json({ error: "not found" }, 404)
		}

		// the rejection names the rule, so the page shows why
		return featureOrderResult === "ranked"
			? context.json({ ok: true })
			: context.json({ error: "only a public topic can be featured" }, 409)
	})
	.post("/admin/users/:id/role", zValidator("json", setRolePayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// change a user's role, rejecting an admin's own self-demotion. admin only.
		if (!(await isAllowed(userId, "admin:setRole"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const isRoleSet = await setUserRole(userId, context.req.param("id"), context.req.valid("json").role)
		return isRoleSet ? context.json({ ok: true }) : context.json({ error: "cannot remove your own admin role" }, 409)
	})
	.get("/admin/users/:id/topics", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// one user's owned topics, as the admin console's expandable row shows them, admin only.
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const topics = await loadAdminUserTopics(context.req.param("id"))
		return topics ? context.json({ topics }) : context.json({ error: "not found" }, 404)
	})
	.post("/admin/users/:id/budget", zValidator("json", budgetOverridePayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// set or clear a user's budget override and resize their key to the new effective budget, admin only.
		if (!(await isAllowed(userId, "admin:setBudget"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		await setUserBudgetOverride(context.req.param("id"), context.req.valid("json").budgetOverrideCents)
		return context.json({ ok: true })
	})

// the ui builds its typed client from this definition
export type AppType = typeof route

// start error monitoring, analytics tracking, and model-call tracing before the api starts serving
// all are no-op without their keys set as environment variables
startMonitoring()
startTelemetry()

// one origin serves the api and the built ui. the /api catch-all is mounted before the app shell, so a missing endpoint responds with JSON not HTML
const app = new Hono()
	// the platform health check. it sits ahead of the api tree, so it never runs the session lookup
	.get("/api/health", (context) => context.json({ status: "ok" }))
	.route("/", route)
	// an unmatched /api path is an api failure. a fetch client must read a 404, not fail parsing an HTML page
	.all("/api/*", (context) => context.json({ error: "not found" }, 404))
	// the bundle itself: hashed assets, the app shell, and whatever vite copied from the public folder
	.on(["GET", "HEAD"], "*", serveStatic({ root: UI_BUNDLE_ROOT, onFound: setBundleCacheControl }))
	// a client-routed path is not a file, so it gets the app shell, and the router resolves it.
	// without a bundle built, this finds nothing and falls through to a 404, which is the normal state in dev
	.on(["GET", "HEAD"], "*", serveStatic({ path: `${UI_BUNDLE_ROOT}/index.html`, onFound: setBundleCacheControl }))

// the headers that send a stored file back as a download.
// the ascii name is stripped of anything that could inject header bytes, with a utf-8 copy beside it,
// and nosniff stops the browser running the file as script
function toDownloadHeaders(filename: string, contentType: string): Record<string, string> {
	const asciiFilename = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "")
	return {
		"Content-Type": contentType,
		"Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
		"X-Content-Type-Options": "nosniff",
	}
}

// stream a chat reply to the user, then record what the chat turn spent and keep the attachments they asked to keep.
// the reply streams as it is generated
function streamChatTurn(
	context: Context,
	reply: ChatReplyStream,
	chatTurn: {
		userId: string
		topicId: string
		question: string
		isPersisted: boolean
		attachments: ChatAttachment[]
		litellmApiKey?: string
		analyticsProperties: AnalyticsProperties
	},
): Response {
	return stream(context, async (writeStream) => {
		// forward each chunk as it arrives
		try {
			for await (const chunk of reply.textStream) {
				await writeStream.write(chunk)
			}
		} catch (error) {
			// a stream that breaks partway still spent tokens, so it falls through to the recording below
			console.error(`chat stream failed for topic ${chatTurn.topicId}`, error)
			reportError(error, "chat", { topicId: chatTurn.topicId })
		}

		// record the spend whether the stream finished or broke, so a partial chat turn is never free
		try {
			const { text, totalTokens, searchCount } = await reply.completion
			await recordChatTurn(
				chatTurn.userId,
				chatTurn.topicId,
				totalTokens,
				searchCount,
				chatTurn.isPersisted,
				chatTurn.question,
				text,
				chatTurn.analyticsProperties,
			)
		} catch (error) {
			// a failed spend recording must not break a reply
			console.error(`chat turn recording failed for topic ${chatTurn.topicId}`, error)
			reportError(error, "chat", { topicId: chatTurn.topicId })
		}

		// keep what the user marked once the reply has landed. this is not awaited,
		// since generating the summaries takes seconds and would hold a finished stream open long enough to read as a hung reply
		keepChatAttachments(chatTurn.userId, chatTurn.topicId, chatTurn.attachments, chatTurn.litellmApiKey).catch(
			(error) => {
				console.error(`keeping chat attachments failed for topic ${chatTurn.topicId}`, error)
				reportError(error, "chat", { topicId: chatTurn.topicId })
			},
		)
	})
}

// a hashed filename never changes contents, so it caches for a year. everything else must revalidate to pick up a new bundle
function setBundleCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/assets/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

// in dev this runs on port 3000 and vite forwards /api to it. in prod, one service serves both the ui and the api.
// Bun's 10-second idle default would drop a quiet streaming chat turn, so idleTimeout matches the model timeout
export default { port: 3000, fetch: app.fetch, idleTimeout: 120 }
