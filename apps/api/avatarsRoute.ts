// the avatar routes: a user's and a team's published image, the uploads, and the decode failure reports

import { toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import { avatarDecodeFailurePayload } from "@carlnotes/contracts/payloads"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { countRateLimitHit } from "@carlnotes/db/redisRateLimits"
import { teams } from "@carlnotes/db/schema/teams"
import { attachmentStream } from "@carlnotes/db/store"
import { reportError } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { stream } from "hono/streaming"
import { isLeaderRole } from "./authorization"
import {
	MAX_AVATAR_BYTES,
	saveAvatarSource,
	toAvatarContentType,
	toPublishedAvatar,
	uploadAvatar,
	uploadTeamAvatar,
} from "./avatars"
import { MULTIPART_ENVELOPE_BYTES, toBodyLimit, uploadSignedOutRejection } from "./bodyLimit"
import { type AppEnv, currentUser } from "./currentUser"
import {
	toTeamAvatarCacheTag,
	toUserAvatarCacheTag,
	toVersionedImageHeaders,
	UNVERSIONED_CACHE_CONTROL,
} from "./edgeCache"
import { toTeamRole } from "./team/members"

// the paths of a user's and a team's avatar upload, after the /api base
export const AVATAR_UPLOAD_PATH = "/avatars"
export const TEAM_AVATAR_UPLOAD_PATH = "/teams/:id/avatar"

// how many decode failure reports one user sends to monitoring. the reports are counted per day
const DAILY_DECODE_FAILURE_REPORT_LIMIT = 5

// the body limit of a user's and a team's upload, set before parseBody buffers the body. it is the avatar limit plus
// room for the multipart envelope
const avatarBodyLimit = toBodyLimit(MAX_AVATAR_BYTES + MULTIPART_ENVELOPE_BYTES, "too-large")

// serve a stored avatar with its unique key as the cache validator, tagged at the edge for a purge on deletion
function serveAvatar(context: Context<AppEnv>, avatarKey: string, cacheTag: string): Response {
	// set the cache headers, long only for a url that names the key's own version, and the tag at every version
	const isCurrentVersion = context.req.query("v") === toAvatarKeyVersion(avatarKey)
	for (const [headerName, headerValue] of Object.entries(toVersionedImageHeaders(isCurrentVersion))) {
		context.header(headerName, headerValue)
	}
	context.header("Cache-Tag", cacheTag)

	// validate by the key
	context.header("ETag", `"${avatarKey}"`)
	// a validator match responds with headers only, so nothing streams from storage
	if (context.req.header("if-none-match") === `"${avatarKey}"`) {
		return context.body(null, 304)
	}
	// the content type is read from the key's extension, saved at upload time
	context.header("Content-Type", toAvatarContentType(avatarKey))
	return stream(context, (responseStream) => responseStream.pipe(attachmentStream(avatarKey)))
}

// the avatar routes: the published images, the uploads, and the decode failure reports
export const avatarsRoute = new Hono<AppEnv>()
	// a published avatar is shown to anyone who can see the profile it belongs to
	.get("/avatars/:userId", async (context) => {
		const publishedAvatar = await toPublishedAvatar(context.req.param("userId"))
		if (!publishedAvatar) {
			return context.json({ error: "not found" }, 404)
		}
		// redirect to a provider photo at its provider and cache the redirect for an hour at most.
		// the provider can change the photo without a new version
		if ("imageUrl" in publishedAvatar) {
			context.header("Cache-Control", UNVERSIONED_CACHE_CONTROL)
			return context.redirect(publishedAvatar.imageUrl, 302)
		}
		return serveAvatar(context, publishedAvatar.avatarKey, toUserAvatarCacheTag(context.req.param("userId")))
	})
	// a chosen avatar file the browser could not decode, reported to monitoring by its type and size alone, five a day
	// per user
	.post("/avatars/decode-failures", zValidator("json", avatarDecodeFailurePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// count the report against the user's daily limit, and report it only within that limit
		const { contentType, byteSize } = context.req.valid("json")
		const isDecodeFailureReportAllowed = await countRateLimitHit({
			key: `avatar-decode-failures:${userId}`,
			rateLimitWindowMs: DAY_MS,
			limit: DAILY_DECODE_FAILURE_REPORT_LIMIT,
		})
		if (isDecodeFailureReportAllowed) {
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
	.post(TEAM_AVATAR_UPLOAD_PATH, uploadSignedOutRejection, avatarBodyLimit, async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// only a leader may change the team's avatar, and the 404 hides the team from everyone else
		const teamId = context.req.param("id")
		if (!isLeaderRole(await toTeamRole(userId, teamId))) {
			return context.json({ error: "not found" }, 404)
		}

		// store the bytes, updating the key so a replacement never reuses the previous object's path
		const uploadedAvatarFile = (await context.req.parseBody()).avatar
		if (!(uploadedAvatarFile instanceof File)) {
			return context.json({ error: "unsupported-type" }, 400)
		}
		const rejection = await uploadTeamAvatar(
			teamId,
			new Uint8Array(await uploadedAvatarFile.arrayBuffer()),
			uploadedAvatarFile.type,
			crypto.randomUUID(),
		)
		return rejection ? context.json({ error: rejection }, 400) : context.json({ ok: true })
	})
	.post(AVATAR_UPLOAD_PATH, uploadSignedOutRejection, avatarBodyLimit, async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// an upload arrives as a file, and a source change as json naming which image to use
		const body = await context.req.parseBody()
		const uploadedAvatarFile = body.avatar
		// no file means the user is selecting between the generated image and their provider photo
		if (!(uploadedAvatarFile instanceof File)) {
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
			new Uint8Array(await uploadedAvatarFile.arrayBuffer()),
			uploadedAvatarFile.type,
			crypto.randomUUID(),
		)
		return rejection ? context.json({ error: rejection }, 400) : context.json({ ok: true })
	})
