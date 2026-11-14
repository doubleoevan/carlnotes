// the avatar routes: a user's and a team's published image, an unchecked upload shown to its uploader alone, the
// uploads, and the decode failure reports

import { toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import { avatarDecodeFailurePayload } from "@carlnotes/contracts/payloads"
import { DAY_MS } from "@carlnotes/contracts/time"
import { UNCHECKED_IMAGE_QUERY_PARAMETER } from "@carlnotes/contracts/uncheckedImages"
import { db } from "@carlnotes/db"
import { toAvatarContentType } from "@carlnotes/db/avatars"
import { countRateLimitHit } from "@carlnotes/db/redisRateLimits"
import { teams } from "@carlnotes/db/schema/teams"
import { attachmentStream } from "@carlnotes/db/store"
import { loadUncheckedImageForUploader } from "@carlnotes/db/uncheckedImages"
import { reportError } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { stream } from "hono/streaming"
import { isLeaderRole } from "./authorization"
import {
	type AvatarRejection,
	type AvatarUploadResult,
	MAX_AVATAR_BYTES,
	saveAvatarSource,
	toPublishedAvatar,
	uploadAvatar,
	uploadTeamAvatar,
} from "./avatars"
import { MULTIPART_ENVELOPE_BYTES, toBodyLimit, uploadSignedOutRejection } from "./bodyLimit"
import { type AppEnv, currentUser } from "./currentUser"
import {
	PRIVATE_NO_STORE_CACHE_CONTROL,
	toTeamAvatarCacheTag,
	toUserAvatarCacheTag,
	toVersionedImageHeaders,
	UNVERSIONED_CACHE_CONTROL,
} from "./edgeCache"
import { toObjectionableContentResponse } from "./moderation"
import { toolCallerRateLimiter } from "./rateLimit"
import { toTeamRole } from "./team/members"
import { toImageUploadResponse } from "./topic/imageEdits"

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

// serve an unchecked avatar to its uploader alone, whose own session reads it and no cache may store
function serveUncheckedAvatar(context: Context<AppEnv>, uncheckedAvatarKey: string): Response {
	context.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
	context.header("Content-Type", toAvatarContentType(uncheckedAvatarKey))
	return stream(context, (responseStream) => responseStream.pipe(attachmentStream(uncheckedAvatarKey)))
}

// whether the url is marked as an unchecked upload's and names a version other than the published avatar's
function isUnpublishedUncheckedAvatarRequest(context: Context<AppEnv>, publishedAvatarKey: string | null): boolean {
	const isUncheckedAvatarRequest = context.req.query(UNCHECKED_IMAGE_QUERY_PARAMETER) === "1"
	return isUncheckedAvatarRequest && context.req.query("v") !== toAvatarKeyVersion(publishedAvatarKey)
}

// the response to a request for an unchecked upload that its session did not upload: not found, which no cache may
// store. another version of the published avatar and a provider photo's redirect never take the unchecked upload's
// place
function toUncheckedAvatarNotFoundResponse(context: Context<AppEnv>): Response {
	context.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
	return context.json({ error: "not found" }, 404)
}

// the signed-in user's own unchecked upload if the url names its version, or null for any other request
function toRequestedUncheckedAvatarKey(context: Context<AppEnv>, userId: string): string | null {
	const sessionUser = context.get("user")
	const uncheckedAvatarKey = sessionUser?.id === userId ? (sessionUser.uncheckedAvatarKey ?? null) : null
	return uncheckedAvatarKey && context.req.query("v") === toAvatarKeyVersion(uncheckedAvatarKey)
		? uncheckedAvatarKey
		: null
}

// the unchecked team avatar of the signed-in uploader if the url names its version, or null for any other request. the
// unchecked avatar is read only for a signed-in request at a version that is not the team's current one
async function loadRequestedUncheckedTeamAvatarKey(
	context: Context<AppEnv>,
	{ teamId, avatarKey }: { teamId: string; avatarKey: string | null },
): Promise<string | null> {
	// a visitor, and a request for the team's current version, reads no unchecked avatar
	const userId = currentUser(context)
	const requestedVersion = context.req.query("v")
	if (!userId || !requestedVersion || requestedVersion === toAvatarKeyVersion(avatarKey)) {
		return null
	}

	// the unchecked avatar this user uploaded, at the version the url names
	const uncheckedImage = await loadUncheckedImageForUploader({ subjectKind: "teamAvatar", subjectId: teamId }, userId)
	const uncheckedAvatarKey = uncheckedImage?.avatarKey ?? null
	return uncheckedAvatarKey && requestedVersion === toAvatarKeyVersion(uncheckedAvatarKey) ? uncheckedAvatarKey : null
}

// the response to a rejected upload: Carl's 422 for an image others may not see, and a 400 naming a failed shape check
function toAvatarRejectionResponse(context: Context<AppEnv>, rejection: AvatarRejection): Response {
	return typeof rejection === "object"
		? toObjectionableContentResponse(context, rejection.objectionableCategory)
		: context.json({ error: rejection }, 400)
}

// the response to an upload: its rejection, or a success in its released shape, with isImageUnchecked if the upload is
// shown to its uploader alone
function toAvatarUploadResponse(context: Context<AppEnv>, avatarUploadResult: AvatarUploadResult): Response {
	if ("rejection" in avatarUploadResult) {
		return toAvatarRejectionResponse(context, avatarUploadResult.rejection)
	}
	return context.json(toImageUploadResponse({ ok: true }, avatarUploadResult.isImageUnchecked))
}

// the avatar routes: the published images, the uploads, and the decode failure reports
export const avatarsRoute = new Hono<AppEnv>()
	// a published avatar is shown to anyone who can see the profile it belongs to
	.get("/avatars/:userId", async (context) => {
		// the signed-in user's own unchecked upload, at its version alone. anyone else gets the published avatar
		const uncheckedAvatarKey = toRequestedUncheckedAvatarKey(context, context.req.param("userId"))
		if (uncheckedAvatarKey) {
			return serveUncheckedAvatar(context, uncheckedAvatarKey)
		}

		// the published avatar. a request for the unchecked upload alone is not found for anyone else, unless the upload
		// was published and is the avatar the url names
		const publishedAvatar = await toPublishedAvatar(context.req.param("userId"))
		const publishedAvatarKey = publishedAvatar && "avatarKey" in publishedAvatar ? publishedAvatar.avatarKey : null
		if (isUnpublishedUncheckedAvatarRequest(context, publishedAvatarKey)) {
			return toUncheckedAvatarNotFoundResponse(context)
		}

		// a 404 for a user on the initials
		if (!publishedAvatar) {
			return context.json({ error: "not found" }, 404)
		}
		// redirect to a provider photo at its provider and cache the redirect for an hour at most.
		// the provider can change the photo without a new version. the tag lets an avatar reset purge the redirect
		if ("imageUrl" in publishedAvatar) {
			context.header("Cache-Control", UNVERSIONED_CACHE_CONTROL)
			context.header("Cache-Tag", toUserAvatarCacheTag(context.req.param("userId")))
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
		if (!team) {
			return context.json({ error: "not found" }, 404)
		}

		// an unchecked upload shown to the signed-in uploader, at its version alone. anyone else gets the published avatar
		const uncheckedAvatarKey = await loadRequestedUncheckedTeamAvatarKey(context, { teamId, avatarKey: team.avatarKey })
		if (uncheckedAvatarKey) {
			return serveUncheckedAvatar(context, uncheckedAvatarKey)
		}

		// a request for the unchecked upload alone is not found for anyone else, unless the upload was published and is
		// the avatar the url names
		if (isUnpublishedUncheckedAvatarRequest(context, team.avatarKey)) {
			return toUncheckedAvatarNotFoundResponse(context)
		}

		// the team's published avatar, or a 404 for a team with none
		return team.avatarKey
			? serveAvatar(context, team.avatarKey, toTeamAvatarCacheTag(teamId))
			: context.json({ error: "not found" }, 404)
	})
	.post(TEAM_AVATAR_UPLOAD_PATH, toolCallerRateLimiter, uploadSignedOutRejection, avatarBodyLimit, async (context) => {
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
		const avatarUploadResult = await uploadTeamAvatar({
			teamId,
			userId,
			bytes: new Uint8Array(await uploadedAvatarFile.arrayBuffer()),
			contentType: uploadedAvatarFile.type,
			keyId: crypto.randomUUID(),
		})
		return toAvatarUploadResponse(context, avatarUploadResult)
	})
	.post(AVATAR_UPLOAD_PATH, toolCallerRateLimiter, uploadSignedOutRejection, avatarBodyLimit, async (context) => {
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
		const avatarUploadResult = await uploadAvatar({
			userId,
			bytes: new Uint8Array(await uploadedAvatarFile.arrayBuffer()),
			contentType: uploadedAvatarFile.type,
			keyId: crypto.randomUUID(),
		})
		return toAvatarUploadResponse(context, avatarUploadResult)
	})
