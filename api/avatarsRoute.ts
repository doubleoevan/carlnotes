// the avatar routes: a user's and a team's published image, the uploads, and the decode failure reports
import { zValidator } from "@hono/zod-validator"
import { toAvatarKeyVersion } from "@shared/avatars"
import { reportError } from "@shared/monitoring"
import { avatarDecodeFailurePayload } from "@shared/payloads"
import { DAY_MS } from "@shared/time"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../db"
import { incrementRateLimitWindow, isWithinRateLimit } from "../db/redis"
import { teams } from "../db/schema/teams"
import { attachmentStream } from "../worker"
import {
	MAX_AVATAR_BYTES,
	saveAvatarSource,
	toAvatarContentType,
	toPublishedAvatar,
	uploadAvatar,
	uploadTeamAvatar,
} from "./avatars"
import { uploadSignedOutRejection } from "./bodyLimit"
import { type AppEnv, currentUser } from "./currentUser"
import { toTeamAvatarCacheTag, toUserAvatarCacheTag, toVersionedImageHeaders } from "./edgeCache"
import { toTeamRole } from "./team/members"

// how long the browser and the edge cache the redirect to a provider photo
const PROVIDER_PHOTO_CACHE_CONTROL = "public, max-age=3600"

// how many decode failure reports one user sends to monitoring in a day, and the day's window they are counted in
const DAILY_DECODE_FAILURE_REPORT_LIMIT = 5
const DECODE_FAILURE_REPORT_WINDOW_MS = DAY_MS

// the body limit of a user's and a team's upload, set before parseBody buffers the body: the avatar limit plus room for
// the multipart envelope
const avatarBodyLimit = bodyLimit({
	maxSize: MAX_AVATAR_BYTES + 1024 * 1024,
	onError: (context) => context.json({ error: "too-large" }, 413),
})

// serve a stored avatar with its unique key as the cache validator, tagged at the edge for a purge on deletion
function serveAvatar(context: Context<AppEnv>, avatarKey: string, cacheTag: string): Response {
	// set the cache headers, long only for a url that names the key's own version, and the tag at every version
	const isCurrentVersion = context.req.query("v") === toAvatarKeyVersion(avatarKey)
	for (const [headerName, headerValue] of Object.entries(toVersionedImageHeaders(isCurrentVersion))) {
		context.header(headerName, headerValue)
	}
	context.header("Cache-Tag", cacheTag)

	// validate by the key and never let the browser guess the type
	context.header("ETag", `"${avatarKey}"`)
	context.header("X-Content-Type-Options", "nosniff")
	// a validator match responds with headers only, so nothing streams from storage
	if (context.req.header("if-none-match") === `"${avatarKey}"`) {
		return context.body(null, 304)
	}
	// the content type is read from the key's extension, saved at upload time
	context.header("Content-Type", toAvatarContentType(avatarKey))
	return stream(context, (responseStream) => responseStream.pipe(attachmentStream(avatarKey)))
}

// the avatar routes: the published image and the upload
export const avatarsRoute = new Hono<AppEnv>()
	// a published avatar is shown to anyone who can see the profile it belongs to
	.get("/avatars/:userId", async (context) => {
		const published = await toPublishedAvatar(context.req.param("userId"))
		if (!published) {
			return context.json({ error: "not found" }, 404)
		}
		// redirect to a provider photo at its provider and cache the redirect for an hour at most.
		// the provider can change the photo without a new version
		if ("imageUrl" in published) {
			context.header("Cache-Control", PROVIDER_PHOTO_CACHE_CONTROL)
			return context.redirect(published.imageUrl, 302)
		}
		return serveAvatar(context, published.avatarKey, toUserAvatarCacheTag(context.req.param("userId")))
	})
	// a chosen avatar file the browser could not decode, reported to monitoring by its type and size alone, five a day
	// per user
	.post("/avatars/decode-failures", zValidator("json", avatarDecodeFailurePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// count the report in the user's day, and report it only within the day's limit
		const { contentType, byteSize } = context.req.valid("json")
		const decodeFailureHit = await incrementRateLimitWindow(
			`avatar-decode-failures:${userId}`,
			DECODE_FAILURE_REPORT_WINDOW_MS,
		)
		if (isWithinRateLimit(decodeFailureHit, DAILY_DECODE_FAILURE_REPORT_LIMIT)) {
			reportError(new Error("a chosen avatar could not be decoded"), "api-route", {
				contentType,
				byteSize: String(byteSize),
			})
		}
		return context.body(null, 204)
	})
	// a team's own uploaded image, shown wherever the team is named
	.get("/team-avatars/:teamId", async (context) => {
		const teamId = context.req.param("teamId")
		const [team] = await db.select({ avatarKey: teams.avatarKey }).from(teams).where(eq(teams.id, teamId))
		return team?.avatarKey
			? serveAvatar(context, team.avatarKey, toTeamAvatarCacheTag(teamId))
			: context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/avatar", uploadSignedOutRejection, avatarBodyLimit, async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// only a leader may change the team's avatar, and the 404 hides the team from everyone else
		const teamId = context.req.param("id")
		if ((await toTeamRole(userId, teamId)) !== "leader") {
			return context.json({ error: "not found" }, 404)
		}

		// store the bytes, updating the key so a replacement never reuses the previous object's path
		const uploaded = (await context.req.parseBody()).avatar
		if (!(uploaded instanceof File)) {
			return context.json({ error: "unsupported-type" }, 400)
		}
		const rejection = await uploadTeamAvatar(
			teamId,
			new Uint8Array(await uploaded.arrayBuffer()),
			uploaded.type,
			crypto.randomUUID(),
		)
		return rejection ? context.json({ error: rejection }, 400) : context.json({ ok: true })
	})
	.post("/avatars", uploadSignedOutRejection, avatarBodyLimit, async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// an upload arrives as a file, and a source change as json naming which image to use
		const body = await context.req.parseBody()
		const uploaded = body.avatar
		// no file means the user is selecting between the generated image and their provider photo
		if (!(uploaded instanceof File)) {
			const avatarSource = typeof body.avatarSource === "string" ? body.avatarSource : ""
			if (avatarSource !== "generated" && avatarSource !== "oauth") {
				return context.json({ error: "unsupported-type" }, 400)
			}
			await saveAvatarSource(userId, avatarSource)
			return context.json({ ok: true })
		}

		// store the bytes under a random key id, so a replacement never reuses the previous object's path
		const rejection = await uploadAvatar(
			userId,
			new Uint8Array(await uploaded.arrayBuffer()),
			uploaded.type,
			crypto.randomUUID(),
		)
		return rejection ? context.json({ error: rejection }, 400) : context.json({ ok: true })
	})
