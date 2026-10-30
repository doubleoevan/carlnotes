// the avatar a user publishes: an upload they chose, the photo their provider supplied, or the username initials
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { avatarSources } from "@carlnotes/contracts/enums"
import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { db } from "@carlnotes/db"
import { teams } from "@carlnotes/db/schema/teams"
import { users } from "@carlnotes/db/schema/users"
import {
	clearPendingObjectDeletion,
	deleteStoredObject,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	uploadAttachment,
} from "@carlnotes/db/store"
import { eq } from "drizzle-orm"
import { toObjectionableImageCategory } from "./moderation"
import { refreshSessionUser } from "./sessions"

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

// why an upload was rejected. a shape check, or the category of a violating image
export type AvatarRejection = "too-large" | "empty" | "unsupported-type" | { objectionableCategory: ModerationCategory }

// the uploaded image, and the kind and id that name it in a moderation failure report
type ToAvatarRejectionOptions = { bytes: Uint8Array; contentType: string; subjectKind: string; subjectId: string }

// the checks every avatar upload must pass: it has bytes, it is small, it is an image we serve, and others may see it
async function toAvatarRejection({
	bytes,
	contentType,
	subjectKind,
	subjectId,
}: ToAvatarRejectionOptions): Promise<AvatarRejection | null> {
	// the shape checks. the type is checked against what the request claims
	if (bytes.byteLength === 0) {
		return "empty"
	}
	if (bytes.byteLength > MAX_AVATAR_BYTES) {
		return "too-large"
	}

	// an image type we serve
	if (!SUPPORTED_AVATAR_TYPES.has(contentType)) {
		return "unsupported-type"
	}

	// the moderation. an unreadable image is rejected as an unsupported type, and a skipped or failed check lets it through
	const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
	const objectionableCategory = await toObjectionableImageCategory({ dataUrl, subjectKind, subjectId })
	if (objectionableCategory === "unreadable") {
		return "unsupported-type"
	}
	return objectionableCategory ? { objectionableCategory } : null
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
	// the checks run before anything is written, so a rejected upload touches no storage
	const rejection = await toAvatarRejection({ bytes, contentType, subjectKind: "avatar", subjectId: userId })
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
	// the same checks that a user's upload must pass before anything is written
	const rejection = await toAvatarRejection({ bytes, contentType, subjectKind: "teamAvatar", subjectId: teamId })
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
