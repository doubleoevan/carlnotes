// the default avatar uses the letters, taken from the name, and the tint, taken from the id

// the tints an avatar circle can take
export const AVATAR_TINTS = ["#8c5a2b", "#a3542e", "#7a4a52", "#6b6440", "#4f5f5a", "#8a4f6d"] as const

// the letters, light enough to stay above 4.5:1 against every tint above
export const AVATAR_COLOR = "#f6efe6"

/**
 * The relative luminance a tint must stay at or below to keep AVATAR_COLOR at 4.5:1 or better.
 */
export const AVATAR_TINT_MAX_LUMINANCE = 0.15

/**
 * The letters a name shows, so `Bright-Macchiato` reads `BM`, `Agent Infra Crew` reads `AI`, and a
 * typed `cooldude` reads `C`
 */
export function toAvatarInitials(username: string): string {
	// both separators the username rules allow split words, and so does the space a team name may include
	let [first, second] = username.trim().split(/[-_\s]+/)

	// a generated name joins its capitalized words bare, so a lone word splits again on its inner capitals
	if (first && !second) {
		const segments = first.split(/(?<=[a-z0-9])(?=[A-Z])/)
		first = segments[0]
		second = segments.length > 1 ? segments[segments.length - 1] : undefined
	}

	// a name someone typed is often one word, which has only its own first letter to display
	return `${first?.[0] ?? ""}${second?.[0] ?? ""}`.toUpperCase()
}

/**
 * The tint a user's circle takes, chosen by their user id.
 */
export function toAvatarTint(userId: string): string {
	return AVATAR_TINTS[toStableHash(userId) % AVATAR_TINTS.length] as string
}

// djb2, which is small, stable across runtimes, and spreads short ids well enough to select one of the six tint buckets.
function toStableHash(text: string): number {
	let hash = 5381
	for (let index = 0; index < text.length; index++) {
		hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
	}
	return hash
}
