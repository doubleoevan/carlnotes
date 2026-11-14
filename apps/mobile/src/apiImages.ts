// how the app's image elements load an api image. an unchecked image's path, which only its uploader's session reads,
// loads with the stored session cookie and is never stored. every other path loads as a bare url, with no header

import { toApiUrl } from "@carlnotes/client/apiClient"
import { toAvatarImagePath, toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import { isUncheckedImagePath, toUncheckedImagePath } from "@carlnotes/contracts/uncheckedImages"

// the expo-image props of one api image: its source, and for an unchecked image the policy that stores nothing
export type ApiImageProps = {
	source: { uri: string; headers?: Record<string, string> }
	cachePolicy?: "none"
}

/**
 * Returns the expo-image props that load an api image path. Only an unchecked image's path, a relative api path whose
 * query names unchecked=1, gets the stored session cookie, with nothing stored. Every other value gets a bare url.
 * Returns null for an unchecked image until the cookie is read, so no request for an unchecked image goes out without
 * it.
 */
export function toApiImageProps(imagePath: string, sessionCookie: string | null): ApiImageProps | null {
	// a path that is not an unchecked image's loads with no header, and the image is stored as usual
	const source = { uri: toApiUrl(imagePath) }
	if (!isUncheckedImagePath(imagePath)) {
		return { source }
	}

	// an unchecked image's request brings the session cookie, and its bytes are never stored
	return sessionCookie ? { source: { ...source, headers: { cookie: sessionCookie } }, cachePolicy: "none" } : null
}

// what an avatar draws: the path its caller gave, or null for the initials, the avatar's owner, whether the caller
// says the path is an unchecked upload's, and the signed-in user, if any
type ToShownAvatarImagePathOptions = {
	imagePath: string | null
	ownerId: string
	isUnchecked: boolean
	sessionUser: { id: string; uncheckedAvatarKey?: string | null } | null | undefined
}

/**
 * Returns the path an avatar loads. The signed-in user's own avatar is the upload shown to them alone while the session
 * names one, wherever the avatar is drawn, at its marked path. A path its caller says is an unchecked upload's is
 * marked as one. Every other path is returned as given, so an unchecked version never loads without the mark.
 */
export function toShownAvatarImagePath({
	imagePath,
	ownerId,
	isUnchecked,
	sessionUser,
}: ToShownAvatarImagePathOptions): string | null {
	// the signed-in user's own unchecked upload, at the path only their session reads
	const isOwnAvatar = sessionUser?.id === ownerId
	const ownUncheckedAvatarVersion = isOwnAvatar ? toAvatarKeyVersion(sessionUser?.uncheckedAvatarKey ?? null) : null
	if (ownUncheckedAvatarVersion) {
		return toUncheckedImagePath(toAvatarImagePath(ownerId, ownUncheckedAvatarVersion))
	}

	// an unchecked upload its caller names, such as the team avatar shown to a leader alone
	return isUnchecked && imagePath ? toUncheckedImagePath(imagePath) : imagePath
}
