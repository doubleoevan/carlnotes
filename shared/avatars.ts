// the default avatar uses the letters, taken from the username, and the tint, taken from the user id.
// both are deterministic, so avatar is always the same image

// the tints an avatar circle can take. each one sits at or below AVATAR_TINT_MAX_LUMINANCE,
// which keeps AVATAR_INK above 4.5:1 against it. adding a tint is checked by the palette test
export const AVATAR_TINTS = ["#8c5a2b", "#a3542e", "#7a4a52", "#6b6440", "#4f5f5a", "#8a4f6d"] as const

// the letters, light enough to stay above 4.5:1 against every tint above
export const AVATAR_INK = "#f6efe6"

/**
 * The relative luminance a tint must stay at or below to keep AVATAR_INK at 4.5:1 or better.
 */
export const AVATAR_TINT_MAX_LUMINANCE = 0.15

/**
 * The letters a username shows, so `Bright-Macchiato` reads `BM` and a typed `cooldude` reads `C`
 */
export function toAvatarInitials(username: string): string {
	// both separators the username rules allow split words, and the collision suffix is digits so only words contribute
	const [adjective, noun] = username.split(/[-_]/)
	// a name someone typed is often one word, which has only its own first letter to give
	return `${adjective?.[0] ?? ""}${noun?.[0] ?? ""}`.toUpperCase()
}

/**
 * The tint a user's circle takes, chosen by their user id.
 */
export function toAvatarTint(userId: string): string {
	return AVATAR_TINTS[toStableHash(userId) % AVATAR_TINTS.length] as string
}

// djb2, which is small, stable across runtimes, and spreads short ids well enough to pick one of the six tint buckets.
function toStableHash(text: string): number {
	let hash = 5381
	for (let index = 0; index < text.length; index++) {
		hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
	}
	return hash
}
