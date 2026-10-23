// a podcast episode's play token: a keyed signature that lets an mcp card's audio element, which sends no session
// cookie, play one podcast episode as the caller who received it, for a day
import { DAY_MS } from "@carlnotes/contracts/time"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"
import { toCanonicalJson } from "../canonicalJson"

// how long a play token stays good
export const PLAY_TOKEN_LIFETIME_MS = DAY_MS

// the podcast episode a token plays, and the user it plays as, or none for a visitor
type PlayTokenOptions = { podcastEpisodeId: string; userId: string | null }

// a valid token's caller: the user, or none for a visitor
type PlayTokenCaller = { userId: string | null }

/**
 * Returns a play token for one podcast episode and caller, good for a day.
 */
export function toPlayToken(playTokenOptions: PlayTokenOptions, now: number = Date.now()): string {
	const expiresAt = now + PLAY_TOKEN_LIFETIME_MS
	const userPart = playTokenOptions.userId ?? ""
	return `${expiresAt}.${userPart}.${toPlayTokenSignature(playTokenOptions, expiresAt)}`
}

/**
 * Returns the caller a play token names for this podcast episode, or null for a token that is expired, forged, or
 * issued for another podcast episode.
 */
export function readPlayToken(
	{ playToken, podcastEpisodeId }: { playToken: string; podcastEpisodeId: string },
	now: number = Date.now(),
): PlayTokenCaller | null {
	// the expiry, the user, and the signature, and an expired or malformed token names no caller
	const [, expiresAtText, userPart, signature] = /^(\d+)\.(.*)\.([^.]+)$/.exec(playToken) ?? []
	const expiresAt = Number(expiresAtText)
	if (userPart === undefined || !signature || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
		return null
	}

	// the signature over this podcast episode and that user
	const userId = userPart || null
	const expectedSignature = toPlayTokenSignature({ podcastEpisodeId, userId }, expiresAt)
	return isSameSignature({ expectedSignature, signature }) ? { userId } : null
}

// the keyed signature over the podcast episode, the user, and the expiry, with its purpose signed beside them
function toPlayTokenSignature({ podcastEpisodeId, userId }: PlayTokenOptions, expiresAt: number): string {
	return toAuthSecretSignature({
		value: toCanonicalJson({ purpose: "podcast episode plays", podcastEpisodeId, userId, expiresAt }),
		purpose: "podcast episode plays",
		encoding: "base64url",
	})
}
