// the avatar a user publishes: an upload they chose, the photo their provider supplied, or the username initials
import type { avatarSources } from "@shared/enums"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../db"
import { teams, users } from "../db/schema"
import { attachmentStream, deleteAttachment, putAttachment } from "../worker"
import { type AppEnv, currentUser } from "./currentUser"
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
 * The key includes a stamp, so a replacement doesn't reuse the previous object's path.
 */
export async function uploadAvatar(
	userId: string,
	bytes: Uint8Array,
	contentType: string,
	stamp: string,
): Promise<AvatarRejection | null> {
	// the shape checks run before anything is written, so a rejected upload touches no storage
	const rejection = toAvatarRejection(bytes, contentType)
	if (rejection) {
		return rejection
	}

	// write the new object first, so a failed upload leaves the user on the avatar they already had
	const avatarKey = `avatars/${userId}/${stamp}.${AVATAR_EXTENSIONS[contentType]}`
	await putAttachment(avatarKey, bytes, contentType)
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
	stamp: string,
): Promise<AvatarRejection | null> {
	// the same shape checks that a user's upload must pass before anything is written
	const rejection = toAvatarRejection(bytes, contentType)
	if (rejection) {
		return rejection
	}

	// write the new object first, so a failed upload leaves the team on the avatar it already had
	const [previous] = await db.select({ avatarKey: teams.avatarKey }).from(teams).where(eq(teams.id, teamId))
	const avatarKey = `avatars/teams/${teamId}/${stamp}.${AVATAR_EXTENSIONS[contentType]}`
	await putAttachment(avatarKey, bytes, contentType)
	await db.update(teams).set({ avatarKey }).where(eq(teams.id, teamId))

	// the row already points at the new object. a failed delete leaves an unused file, never a broken avatar
	if (previous?.avatarKey && previous.avatarKey !== avatarKey) {
		await deleteAttachment(previous.avatarKey).catch((error) => console.error("team avatar cleanup failed", error))
	}
	return null
}

/**
 * Point a user at their oauth provider photo or back at the username initials.
 * The oauth provider photo is opt-in only.
 */
export async function saveAvatarSource(userId: string, avatarSource: "generated" | "oauth"): Promise<void> {
	await replaceAvatar(userId, avatarSource, null)
}

// where a published avatar comes from: a stored object, a url from the user's oauth provider
export type PublishedAvatar = { avatarKey: string } | { imageUrl: string } | null

/**
 * Where a user's published avatar comes from.
 */
export async function toPublishedAvatar(userId: string): Promise<PublishedAvatar> {
	const [user] = await db
		.select({ avatarSource: users.avatarSource, avatarKey: users.avatarKey, image: users.image })
		.from(users)
		.where(eq(users.id, userId))
	if (user?.avatarSource === "upload" && user.avatarKey) {
		return { avatarKey: user.avatarKey }
	}
	// the oauth provider photo is opt-in only
	return user?.avatarSource === "oauth" && user.image ? { imageUrl: user.image } : null
}

// the object key behind a user's uploaded avatar, or null when they have none stored
async function toAvatarKey(userId: string): Promise<string | null> {
	const [user] = await db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, userId))
	return user?.avatarKey ?? null
}

// point the user at a source, dropping the object the previous one left behind
async function replaceAvatar(
	userId: string,
	avatarSource: (typeof avatarSources)[number],
	avatarKey: string | null,
): Promise<void> {
	const previousKey = await toAvatarKey(userId)
	await db.update(users).set({ avatarSource, avatarKey }).where(eq(users.id, userId))

	// the users row is already optimistically updated. a failed delete leaves an unused file instead of a broken avatar
	if (previousKey && previousKey !== avatarKey) {
		await deleteAttachment(previousKey).catch((error) => console.error("avatar cleanup failed", error))
	}
}

// serve a stored avatar with its stamped key as the cache validator
function serveAvatar(context: Context<AppEnv>, avatarKey: string): Response {
	context.header("ETag", `"${avatarKey}"`)
	context.header("Cache-Control", "public, max-age=300")
	context.header("X-Content-Type-Options", "nosniff")
	// a validator match responds with headers only, so nothing streams from storage
	if (context.req.header("if-none-match") === `"${avatarKey}"`) {
		return context.body(null, 304)
	}
	// the content type is read from the key's extension, stamped at upload time
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
		// a provider photo lives at the provider, so the browser is sent there instead of proxied through here
		if ("imageUrl" in published) {
			return context.redirect(published.imageUrl, 302)
		}
		return serveAvatar(context, published.avatarKey)
	})
	// a team's own uploaded image, shown wherever the team is named
	.get("/team-avatars/:teamId", async (context) => {
		const [team] = await db
			.select({ avatarKey: teams.avatarKey })
			.from(teams)
			.where(eq(teams.id, context.req.param("teamId")))
		return team?.avatarKey ? serveAvatar(context, team.avatarKey) : context.json({ error: "not found" }, 404)
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

			// store the bytes, stamping the key so a replacement never reuses the previous object's path
			const rejection = await uploadAvatar(
				userId,
				new Uint8Array(await uploaded.arrayBuffer()),
				uploaded.type,
				crypto.randomUUID(),
			)
			return rejection ? context.json({ error: rejection }, 400) : context.json({ ok: true })
		},
	)
