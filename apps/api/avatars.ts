// the avatar a user publishes: an upload they chose, the photo their provider supplied, or the username initials. an
// upload is checked, stored as the server's own resized re-encode, and shown to its uploader alone if its image
// moderation could not run

import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { db } from "@carlnotes/db"
import {
	AVATAR_EXTENSIONS,
	replaceAvatar,
	replaceTeamAvatar,
	saveUncheckedAvatar,
	saveUncheckedTeamAvatar,
} from "@carlnotes/db/avatars"
import { users } from "@carlnotes/db/schema/users"
import { recordPendingObjectDeletionBeforeUpload, uploadAttachment } from "@carlnotes/db/store"
import { type StoredAvatar, toStoredAvatar } from "@carlnotes/pipeline/avatarImages"
import { toDataUrl } from "@carlnotes/server/dataUrl"
import { eq } from "drizzle-orm"
import { toObjectionableImageCategory } from "./moderation"

// an avatar is shown at 64 pixels and under, so a large file buys nothing and costs storage on every account
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// the image types an upload may claim, which a browser renders inline everywhere
const SUPPORTED_AVATAR_TYPES = new Set(Object.keys(AVATAR_EXTENSIONS))

// why an upload was rejected. a shape check, or the category of a violating image
export type AvatarRejection = "too-large" | "empty" | "unsupported-type" | { objectionableCategory: ModerationCategory }

// what an upload came to: why it was rejected, or that it is stored, with whether it is shown to its uploader alone
export type AvatarUploadResult = { rejection: AvatarRejection } | { isImageUnchecked: boolean }

// an upload that passed its checks: the re-encode to store, and whether its image moderation could not run
type CheckedAvatar = { storedAvatar: StoredAvatar; isUnchecked: boolean }

// the uploaded image, and the kind and id that name it in a moderation failure report
type ToCheckedAvatarOptions = { bytes: Uint8Array; contentType: string; subjectKind: string; subjectId: string }

// the checks every avatar upload must pass: it has bytes, it is small in bytes and in pixels, it is an image we serve,
// and others may see it. returns the re-encode to store, or why the upload was rejected
async function toCheckedAvatar({
	bytes,
	contentType,
	subjectKind,
	subjectId,
}: ToCheckedAvatarOptions): Promise<CheckedAvatar | { rejection: AvatarRejection }> {
	// the shape checks. the type is checked against what the request claims
	if (bytes.byteLength === 0) {
		return { rejection: "empty" }
	}
	if (bytes.byteLength > MAX_AVATAR_BYTES) {
		return { rejection: "too-large" }
	}

	// an image type we serve
	if (!SUPPORTED_AVATAR_TYPES.has(contentType)) {
		return { rejection: "unsupported-type" }
	}

	// the pixel size and the format, read before the image is decoded, and the resized re-encode the app stores
	const storedAvatar = await toStoredAvatar(bytes)
	if (storedAvatar === "too-large" || storedAvatar === "unsupported-type") {
		return { rejection: storedAvatar }
	}

	// the moderation, on the image that will show. an unreadable image is rejected as an unsupported type, a skipped
	// check lets it through, and a check that could not run leaves it unchecked
	const dataUrl = toDataUrl(storedAvatar.contentType, storedAvatar.bytes)
	const objectionableCategory = await toObjectionableImageCategory({ dataUrl, subjectKind, subjectId })
	if (objectionableCategory === "unreadable") {
		return { rejection: "unsupported-type" }
	}

	// a violating image is rejected with its category
	if (objectionableCategory && objectionableCategory !== "unchecked") {
		return { rejection: { objectionableCategory } }
	}
	return { storedAvatar, isUnchecked: objectionableCategory === "unchecked" }
}

// write a checked avatar's re-encode under a key that names a random id, so a replacement never reuses the previous
// object's path, and return the key. the key is recorded as pending first, with the upload grace period
async function storeCheckedAvatar(keyPrefix: string, keyId: string, storedAvatar: StoredAvatar): Promise<string> {
	const avatarKey = `${keyPrefix}/${keyId}.${AVATAR_EXTENSIONS[storedAvatar.contentType]}`
	await recordPendingObjectDeletionBeforeUpload(avatarKey)
	await uploadAttachment(avatarKey, storedAvatar.bytes, storedAvatar.contentType)
	return avatarKey
}

// an uploaded user avatar: who uploaded it, its bytes and the type the request claims, and the random id its key names
export type UploadAvatarOptions = { userId: string; bytes: Uint8Array; contentType: string; keyId: string }

/**
 * Stores an uploaded avatar and points the user at it. An upload whose image moderation could not run stays unchecked:
 * the user alone sees it, and their published avatar stays as it is until the sweep's check passes.
 */
export async function uploadAvatar({
	userId,
	bytes,
	contentType,
	keyId,
}: UploadAvatarOptions): Promise<AvatarUploadResult> {
	// the checks run before anything is written, so a rejected upload touches no storage
	const checkedAvatar = await toCheckedAvatar({ bytes, contentType, subjectKind: "avatar", subjectId: userId })
	if ("rejection" in checkedAvatar) {
		return checkedAvatar
	}

	// write the new object, then save it as unchecked for the user alone or point the user at it
	const avatarKey = await storeCheckedAvatar(`avatars/${userId}`, keyId, checkedAvatar.storedAvatar)
	if (checkedAvatar.isUnchecked) {
		await saveUncheckedAvatar(userId, avatarKey)
	} else {
		await replaceAvatar(userId, "upload", avatarKey)
	}
	return { isImageUnchecked: checkedAvatar.isUnchecked }
}

// an uploaded team avatar: the team, the leader who uploaded it, its bytes and the type the request claims, and the
// random id its key names
export type UploadTeamAvatarOptions = UploadAvatarOptions & { teamId: string }

/**
 * Stores an uploaded team avatar and points the team at it. The object is written before the row moves onto it, so an
 * upload that fails partway leaves the team on the image it already had. An upload whose image moderation could not
 * run stays unchecked: its uploader alone sees it, and the team's avatar stays as it is until the sweep's check passes.
 */
export async function uploadTeamAvatar({
	teamId,
	userId,
	bytes,
	contentType,
	keyId,
}: UploadTeamAvatarOptions): Promise<AvatarUploadResult> {
	// the same checks that a user's upload must pass before anything is written
	const checkedAvatar = await toCheckedAvatar({ bytes, contentType, subjectKind: "teamAvatar", subjectId: teamId })
	if ("rejection" in checkedAvatar) {
		return checkedAvatar
	}

	// write the new object, then save it as unchecked for its uploader alone or point the team at it
	const avatarKey = await storeCheckedAvatar(`avatars/teams/${teamId}`, keyId, checkedAvatar.storedAvatar)
	if (checkedAvatar.isUnchecked) {
		await saveUncheckedTeamAvatar({ teamId, uploaderUserId: userId, avatarKey })
	} else {
		await replaceTeamAvatar(teamId, avatarKey)
	}
	return { isImageUnchecked: checkedAvatar.isUnchecked }
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
function isProviderPhotoUrl(imageUrl: string): boolean {
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
