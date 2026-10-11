// the avatar a user publishes: an upload they chose, the photo their provider supplied, or the username initials
import { zValidator } from "@hono/zod-validator"
import { toAvatarKeyVersion, toAvatarVersion } from "@shared/avatars"
import type { ProfileIdentity } from "@shared/contracts"
import type { avatarSources } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { avatarDecodeFailurePayload } from "@shared/payloads"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../db"
import { teams } from "../db/schema/teams"
import { users } from "../db/schema/users"
import {
	attachmentStream,
	clearPendingObjectDeletion,
	deleteStoredObject,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	uploadAttachment,
} from "../worker"
import { type AppEnv, currentUser } from "./currentUser"
import { toTeamAvatarCacheTag, toUserAvatarCacheTag, toVersionedImageHeaders } from "./edgeCache"
import { refreshSessionUser } from "./sessions"
import { toTeamRole } from "./team/members"

// an avatar is shown at 64 pixels and under, so a large file buys nothing and costs storage on every account
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// the image types a browser will render inline everywhere. svg is rejected: it is a document that can include a script
const AVATAR_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
}
const SUPPORTED_AVATAR_TYPES = new Set(Object.keys(AVATAR_EXTENSIONS))

/**
 * The media type a stored avatar should be served as, read from the file extension. Falls back to png.
 */
export function toAvatarContentType(avatarKey: string): string {
	const fileExtension = avatarKey.split(".").pop() ?? ""
	return Object.keys(AVATAR_EXTENSIONS).find((type) => AVATAR_EXTENSIONS[type] === fileExtension) ?? "image/png"
}

// why an upload was rejected, or null if it can be stored
export type AvatarRejection = "too-large" | "empty" | "unsupported-type"

// the shape checks every avatar upload must pass: it has bytes, it is small, and it is an image we serve
function toAvatarRejection(bytes: Uint8Array, contentType: string): AvatarRejection | null {
	if (bytes.byteLength === 0) {
		return "empty"
	}
	if (bytes.byteLength > MAX_AVATAR_BYTES) {
		return "too-large"
	}
	// the type is checked against what the request claims, which is enough for a file served back as an image
	return SUPPORTED_AVATAR_TYPES.has(contentType) ? null : "unsupported-type"
}

/**
 * Store an uploaded avatar and point the user at it.
 * The key includes a random id, so a replacement doesn't reuse the previous object's path.
 */
export async function uploadAvatar(
	userId: string,
	bytes: Uint8Array,
	contentType: string,
	keyId: string,
): Promise<AvatarRejection | null> {
	// the shape checks run before anything is written, so a rejected upload touches no storage
	const rejection = toAvatarRejection(bytes, contentType)
	if (rejection) {
		return rejection
	}

	// record the key as pending with the upload grace period, write the new object, then point the user at it
	const avatarKey = `avatars/${userId}/${keyId}.${AVATAR_EXTENSIONS[contentType]}`
	await recordPendingObjectDeletionBeforeUpload(avatarKey)
	await uploadAttachment(avatarKey, bytes, contentType)
	await replaceAvatar(userId, "upload", avatarKey)
	return null
}

/**
 * Store an uploaded team avatar and point the team at it. The object is written before the row moves onto it,
 * so an upload that fails partway leaves the team on the image it already had,
 * and the old object is only deleted once nothing points at it.
 */
export async function uploadTeamAvatar(
	teamId: string,
	bytes: Uint8Array,
	contentType: string,
	keyId: string,
): Promise<AvatarRejection | null> {
	// the same shape checks that a user's upload must pass before anything is written
	const rejection = toAvatarRejection(bytes, contentType)
	if (rejection) {
		return rejection
	}

	// record the key as pending with the upload grace period, then write the new object
	const avatarKey = `avatars/teams/${teamId}/${keyId}.${AVATAR_EXTENSIONS[contentType]}`
	await recordPendingObjectDeletionBeforeUpload(avatarKey)
	await uploadAttachment(avatarKey, bytes, contentType)

	// read the previous key with the row locked, record it as pending, point the team at the new object,
	// and clear the new key's pending row, in one transaction
	const replacedAvatarKey = await db.transaction(async (transaction) => {
		const [team] = await transaction
			.select({ avatarKey: teams.avatarKey })
			.from(teams)
			.where(eq(teams.id, teamId))
			.for("update")
		const lockedReplacedAvatarKey = toReplacedAvatarKey(team?.avatarKey ?? null, avatarKey)

		// record the replaced key, point the team at the new object, and clear the new key's pending row
		if (lockedReplacedAvatarKey) {
			await recordPendingObjectDeletions({ handle: transaction, objectKeys: [lockedReplacedAvatarKey] })
		}
		await transaction.update(teams).set({ avatarKey }).where(eq(teams.id, teamId))
		await clearPendingObjectDeletion(avatarKey, transaction)
		return lockedReplacedAvatarKey
	})

	// delete the replaced object, which nothing points at now
	if (replacedAvatarKey) {
		await deleteStoredObject(replacedAvatarKey)
	}
	return null
}

// the previous avatar key an upload replaces, or null if there was none or the key is unchanged
function toReplacedAvatarKey(previousAvatarKey: string | null, avatarKey: string | null): string | null {
	return previousAvatarKey && previousAvatarKey !== avatarKey ? previousAvatarKey : null
}

/**
 * Point a user at their oauth provider photo or back at the username initials.
 */
export async function saveAvatarSource(userId: string, avatarSource: "generated" | "oauth"): Promise<void> {
	await replaceAvatar(userId, avatarSource, null)
}

// where a published avatar comes from: a stored object, a url from the user's oauth provider
export type PublishedAvatar = { avatarKey: string } | { imageUrl: string } | null

// how long the browser and the edge cache the redirect to a provider photo
const PROVIDER_PHOTO_CACHE_CONTROL = "public, max-age=3600"

// the provider photo origins an avatar may redirect to. users.image comes from the browser and is not trusted
export const PROVIDER_PHOTO_ORIGINS = new Set([
	"https://lh3.googleusercontent.com",
	"https://avatars.githubusercontent.com",
])

// whether a url is a provider photo the redirect may show. an origin carries the scheme, so http never matches
export function isProviderPhotoUrl(imageUrl: string): boolean {
	try {
		return PROVIDER_PHOTO_ORIGINS.has(new URL(imageUrl).origin)
	} catch {
		return false
	}
}

// the user columns that a published avatar is chosen from
export const publishedAvatarColumns = {
	avatarSource: users.avatarSource,
	avatarKey: users.avatarKey,
	image: users.image,
}

/**
 * Where a user's published avatar comes from.
 */
export async function toPublishedAvatar(userId: string): Promise<PublishedAvatar> {
	const [user] = await db.select(publishedAvatarColumns).from(users).where(eq(users.id, userId))
	return toPublishedAvatarFromUser(user)
}

/**
 * Where a user's published avatar comes from, chosen from the user's avatar columns.
 */
export function toPublishedAvatarFromUser(
	user: { avatarSource: string | null; avatarKey: string | null; image: string | null } | undefined,
): PublishedAvatar {
	// an uploaded image is served from this app's own storage, an oauth photo comes from its provider
	if (user?.avatarSource === "upload" && user.avatarKey) {
		return { avatarKey: user.avatarKey }
	}

	// only a real provider photo host redirects
	if (user?.avatarSource === "oauth" && user.image && isProviderPhotoUrl(user.image)) {
		return { imageUrl: user.image }
	}
	return null
}

/**
 * Returns a user's joined columns with the version that their avatar url names in place of the storage key.
 */
export function withAvatarVersion<UserColumns extends { avatarSource: string | null; avatarKey: string | null }>(
	userColumns: UserColumns,
): Omit<UserColumns, "avatarKey"> & { avatarVersion: string | null } {
	// replace the storage key with the version that the avatar url names. the key stays in the api
	const { avatarKey, ...identity } = userColumns
	return { ...identity, avatarVersion: toAvatarVersion({ avatarSource: userColumns.avatarSource, avatarKey }) }
}

// a person's left-joined columns: all null, or the whole object null, if the join found no account
type JoinedProfileColumns = {
	userId: string | null
	username: string | null
	avatarSource: string | null
	avatarKey: string | null
}

/**
 * Returns a left-joined person's public identity, or null if the join found no account.
 */
export function toProfileIdentity(profileColumns: JoinedProfileColumns | null): ProfileIdentity | null {
	if (!profileColumns?.userId || !profileColumns.username) {
		return null
	}
	return {
		userId: profileColumns.userId,
		username: profileColumns.username,
		avatarSource: profileColumns.avatarSource,
		avatarVersion: toAvatarVersion(profileColumns),
	}
}

// point the user at a source, dropping the object the previous one left behind
async function replaceAvatar(
	userId: string,
	avatarSource: (typeof avatarSources)[number],
	avatarKey: string | null,
): Promise<void> {
	// read the previous key with the row locked, record it as pending, write the avatar to the row,
	// and clear an uploaded key's pending row, in one transaction
	const replacedAvatarKey = await db.transaction(async (transaction) => {
		const [user] = await transaction
			.select({ avatarKey: users.avatarKey })
			.from(users)
			.where(eq(users.id, userId))
			.for("update")
		const lockedReplacedAvatarKey = toReplacedAvatarKey(user?.avatarKey ?? null, avatarKey)

		// record the replaced key, then write the avatar
		if (lockedReplacedAvatarKey) {
			await recordPendingObjectDeletions({ handle: transaction, objectKeys: [lockedReplacedAvatarKey] })
		}
		await transaction.update(users).set({ avatarSource, avatarKey }).where(eq(users.id, userId))

		// clear an uploaded key's pending row
		if (avatarKey) {
			await clearPendingObjectDeletion(avatarKey, transaction)
		}
		return lockedReplacedAvatarKey
	})

	// write the avatar to the user's sessions, then delete the replaced object, which nothing points at now
	await refreshSessionUser(userId)
	if (replacedAvatarKey) {
		await deleteStoredObject(replacedAvatarKey)
	}
}

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
	// a chosen avatar file the browser could not decode, reported to monitoring by its type and size alone
	.post("/avatars/decode-failures", zValidator("json", avatarDecodeFailurePayload), (context) => {
		if (!currentUser(context)) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const { contentType, byteSize } = context.req.valid("json")
		reportError(new Error("a chosen avatar could not be decoded"), "api-route", {
			contentType,
			byteSize: String(byteSize),
		})
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
	.post(
		"/teams/:id/avatar",
		// the same body limit as the user upload
		bodyLimit({
			maxSize: MAX_AVATAR_BYTES + 1024 * 1024,
			onError: (context) => context.json({ error: "too-large" }, 413),
		}),
		async (context) => {
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
		},
	)
	.post(
		"/avatars",
		// limit the body before parseBody buffers it. the avatar limit plus room for the multipart envelope
		bodyLimit({
			maxSize: MAX_AVATAR_BYTES + 1024 * 1024,
			onError: (context) => context.json({ error: "too-large" }, 413),
		}),
		async (context) => {
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
		},
	)
