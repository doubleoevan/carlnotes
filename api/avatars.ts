// the avatar a user publishes: an upload they chose, the photo their provider supplied, or the username initials.
// the username initials needs nothing stored, so only the other two ever write an object
import type { avatarSources } from "@shared/enums"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../db"
import { users } from "../db/schema"
import { attachmentStream, deleteAttachment, putAttachment } from "../worker"
import { type AppEnv, currentUser } from "./currentUser"

// an avatar is shown at 64 pixels and under, so a large file buys nothing and costs storage on every account
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// the image types a browser will render inline everywhere. svg is refused: it is a document that can carry a script,
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

// why an upload was refused, or null if it can be stored
export type AvatarRejection = "too-large" | "empty" | "unsupported-type"

/**
 * Store an uploaded avatar and point the user at it.
 * The key includes a stamp, so a replacement doesn't land on the previous object's path.
 */
export async function uploadAvatar(
	userId: string,
	bytes: Uint8Array,
	contentType: string,
	stamp: string,
): Promise<AvatarRejection | null> {
	// the shape checks run before anything is written, so a refused upload touches no storage
	if (bytes.byteLength === 0) {
		return "empty"
	}
	if (bytes.byteLength > MAX_AVATAR_BYTES) {
		return "too-large"
	}
	// the type is checked against what the request claims, which is enough for a file served back as an image
	if (!SUPPORTED_AVATAR_TYPES.has(contentType)) {
		return "unsupported-type"
	}

	// write the new object first, so a failed upload leaves the user on the avatar they already had.
	// the key ends in the type's extension, which is how the read side knows what to serve it as
	const avatarKey = `avatars/${userId}/${stamp}.${AVATAR_EXTENSIONS[contentType]}`
	await putAttachment(avatarKey, bytes, contentType)
	await replaceAvatar(userId, "upload", avatarKey)
	return null
}

/**
 * Point a user at their oauth provider photo or back at the username initials.
 * The oath provider photo is opt-in only.
 */
export async function saveAvatarSource(userId: string, avatarSource: "generated" | "oauth"): Promise<void> {
	await replaceAvatar(userId, avatarSource, null)
}

// where a published avatar comes from: a stored object, a url from the user's oauth provider,
// or nothing when they use the default username initials
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
	// the oauth provider photo opted-in only
	return user?.avatarSource === "oauth" && user.image ? { imageUrl: user.image } : null
}

// the object key behind a user's uploaded avatar, or null when they have none stored
async function toAvatarKey(userId: string): Promise<string | null> {
	const [user] = await db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, userId))
	return user?.avatarKey ?? null
}

// point the user at a source, dropping the object the previous one left behind.
// an opt-out that only stopped rendering the file would leave a published photo sitting in storage
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

// the avatar routes: the published image and the upload
export const avatarsRoute = new Hono<AppEnv>()
	// public: a published avatar is shown to anyone who can see the profile it belongs to.
	// a user on the generated image has none, and 404 is what tells the client to draw the initials
	.get("/avatars/:userId", async (context) => {
		const published = await toPublishedAvatar(context.req.param("userId"))
		if (!published) {
			return context.json({ error: "not found" }, 404)
		}
		// a provider photo lives at the provider, so the browser is sent there instead of proxied through here
		if ("imageUrl" in published) {
			return context.redirect(published.imageUrl, 302)
		}
		// not cached. one url per user outlives every change to the image behind it, so anything held would be stale.
		// caching it would mean versioning the url, and an avatar is small enough that nobody has needed to
		return stream(context, async (responseStream) => {
			context.header("Cache-Control", "no-store")
			context.header("Content-Type", toAvatarContentType(published.avatarKey))
			context.header("X-Content-Type-Options", "nosniff")
			await responseStream.pipe(attachmentStream(published.avatarKey))
		})
	})
	.post(
		"/avatars",
		// cap the body before parseBody buffers it. the avatar cap plus room for the multipart envelope
		bodyLimit({
			maxSize: MAX_AVATAR_BYTES + 1024 * 1024,
			onError: (context) => context.json({ error: "too-large" }, 413),
		}),
		async (context) => {
			// reject a signed-out caller
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}

			// an upload arrives as a file, and a source change as json naming which image to use
			const body = await context.req.parseBody()
			const uploaded = body.avatar
			// no file means the caller is picking between the generated image and their provider photo
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
				Date.now().toString(36),
			)
			return rejection ? context.json({ error: rejection }, 400) : context.json({ ok: true })
		},
	)
