// the api server for the topic feed and topic pages. the ui calls these routes through a fully typed client.
import { zValidator } from "@hono/zod-validator"
import {
	attachmentUrlPayload,
	consumedPayload,
	ratingPayload,
	signupGatePayload,
	subscriptionPayload,
	updateTopicPayload,
} from "@shared/contracts"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { setCookie } from "hono/cookie"
import { z } from "zod"
import {
	AttachmentValidationError,
	attachmentStream,
	ingestAttachment,
	ingestUrlAttachment,
	MAX_ATTACHMENT_BYTES,
} from "../worker"
import { auth, GATE_COOKIE_MAX_AGE_SECONDS, GATE_COOKIE_NAME, signGateToken, verifyTurnstileToken } from "./auth"
import { type AppEnv, currentUser } from "./currentUser"
import { deleteTopicAttachment, loadDownloadableAttachment } from "./topic/attachments"
import { buildTopicFeeds } from "./topic/feeds"
import { recordView, setConsumed, setRating } from "./topic/findings"
import { loadOwnedTopic } from "./topic/permissions"
import { topicsRemaining } from "./topic/quotas"
import {
	createTopic,
	deleteTopic,
	loadTopicPayload,
	runManualScan,
	setTopicSubscription,
	updateTopic,
} from "./topic/topics"

// the "All" vs. "Unread" topic finding toggle
const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

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
	// public: a signed-out visitor gets featured and popular, just no "yours". every route below requires a session
	.get("/topic-feed", zValidator("query", topicFeedQuery), async (context) => {
		const userId = currentUser(context)
		// only include consumed topic findings unless the client asks for the "All" view
		const includeConsumed = context.req.valid("query").all === "true"
		// merge in the topic-creation quota. a signed-out visitor has none so gets zero
		const [topicFeeds, remaining] = await Promise.all([
			buildTopicFeeds(userId, includeConsumed),
			userId ? topicsRemaining(userId) : Promise.resolve(0),
		])
		return context.json({ ...topicFeeds, topicsRemaining: remaining })
	})
	.post("/topics", zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a topic for the current user within the topic cap
		const createTopicResult = await createTopic(userId, context.req.valid("json"))
		return createTopicResult.status === "created"
			? context.json({ id: createTopicResult.id })
			: context.json({ error: "quota exhausted" }, 429)
	})
	.post("/topic-findings/:id/rating", zValidator("json", ratingPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// rate this topic finding up, down, or clear the rating. only its topic's owner or a subscriber may
		const isRated = await setRating(userId, context.req.param("id"), context.req.valid("json").rating)
		return isRated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/consume", zValidator("json", consumedPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// mark this topic finding consumed or unread for the current user
		const isConsumed = await setConsumed(userId, context.req.param("id"), context.req.valid("json").isConsumed)
		return isConsumed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/view", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// opening a resource records a view on its topic finding and marks the finding consumed
		const isViewed = await recordView(userId, context.req.param("id"))
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
		// save the edit topic's fields and reconcile the invitee and source lists. owner only
		const isUpdated = await updateTopic(userId, context.req.param("id"), context.req.valid("json"))
		return isUpdated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// delete the topic and everything attached to it. owner only
		const isDeleted = await deleteTopic(userId, context.req.param("id"))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topics/:id/scan", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// trigger a manual scan within the daily quota. owner only
		const scanResult = await runManualScan(userId, context.req.param("id"))
		if (scanResult.status === "started") {
			return context.json({ remaining: scanResult.remaining })
		}

		// an exhausted quota and a non-owner fail differently so the ui shuold tell them apart
		return scanResult.status === "quota"
			? context.json({ error: "quota exhausted" }, 429)
			: context.json({ error: "forbidden" }, 403)
	})
	.post("/topics/:id/subscription", zValidator("json", subscriptionPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// subscribe or unsubscribe the current user from a public or invite topic
		const { isSubscribed } = context.req.valid("json")
		const isSet = await setTopicSubscription(userId, context.req.param("id"), isSubscribed)
		return isSet ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
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

			// run the real ingestion: size and type validation, object storage, and context generation
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
				// a validation error names the user's own mistake, safe to show verbatim.
				// anything else (a misconfigured llm proxy, a network failure) is an operator problem —
				// log the real cause and keep it out of the response
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

		// check the owner first, so a stranger's link does no fetch or model work
		if (!(await loadOwnedTopic(userId, context.req.param("id")))) {
			return context.json({ error: "forbidden" }, 403)
		}

		// run the real ingestion: url validation, the page fetch, and context generation
		try {
			const attachment = await ingestUrlAttachment(context.req.param("id"), context.req.valid("json").url)
			return context.json({ id: attachment.id, filename: attachment.filename })
		} catch (error) {
			// same split as the file upload: a validation error names the user's mistake, anything else is an operator problem
			if (error instanceof AttachmentValidationError) {
				return context.json({ error: error.message }, 400)
			}
			console.error(`url attachment ingestion failed for topic ${context.req.param("id")}`, error)
			return context.json({ error: "Carl couldn't process that link. Try again in a moment." }, 502)
		}
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

		// the content-disposition carries an ascii-safe filename plus an rfc 5987 utf-8 copy.
		// stripping control characters and non-ascii from the fallback stops a crafted filename from injecting header bytes
		const asciiFilename = attachment.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "")
		// nosniff keeps the browser from second-guessing the stored content type and running an uploaded file as script
		return context.body(attachmentStream(attachment.objectKey), 200, {
			"Content-Type": attachment.contentType,
			"Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
			"X-Content-Type-Options": "nosniff",
		})
	})

// the ui builds its typed client from this definition
export type AppType = typeof route

// in dev this runs on port 3000 and vite forwards /api to it. in prod, one service serves both the ui and the api.
export default { port: 3000, fetch: route.fetch }
