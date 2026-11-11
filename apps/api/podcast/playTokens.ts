// a play token: a keyed signature that lets an MCP view's audio element, which sends no session cookie, play one
// podcast episode or one Topic Post's discussion as the caller who received it, for a day
import { DAY_MS } from "@carlnotes/contracts/time"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"
import { toCanonicalJson } from "../canonicalJson"

// how long a play token stays good
export const PLAY_TOKEN_LIFETIME_MS = DAY_MS

// the recording a token plays: a podcast episode, or a Topic Post's discussion
type PlayTokenRecording = { podcastEpisodeId: string } | { topicPostId: string }

// the recording a token plays, and the user it plays as, or none for a visitor
type PlayTokenOptions = PlayTokenRecording & { userId: string | null }

// a valid token's caller: the user, or none for a visitor
export type PlayTokenCaller = { userId: string | null }

/**
 * Returns a play token for one recording and caller, good for a day.
 */
export function toPlayToken(playTokenOptions: PlayTokenOptions, now: number = Date.now()): string {
	const expiresAt = now + PLAY_TOKEN_LIFETIME_MS
	const userPart = playTokenOptions.userId ?? ""
	return `${expiresAt}.${userPart}.${toPlayTokenSignature(playTokenOptions, expiresAt)}`
}

/**
 * Returns the caller a play token names for this recording, or null for a token that is expired, forged, or issued
 * for another recording.
 */
export function readPlayToken(
	{ playToken, ...playTokenRecording }: { playToken: string } & PlayTokenRecording,
	now: number = Date.now(),
): PlayTokenCaller | null {
	// the expiry, the user, and the signature, and an expired or malformed token names no caller
	const [, expiresAtText, userPart, signature] = /^(\d+)\.(.*)\.([^.]+)$/.exec(playToken) ?? []
	const expiresAt = Number(expiresAtText)
	if (userPart === undefined || !signature || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
		return null
	}

	// the signature over this recording and that user
	const userId = userPart || null
	const expectedSignature = toPlayTokenSignature({ ...playTokenRecording, userId }, expiresAt)
	return isSameSignature({ expectedSignature, signature }) ? { userId } : null
}

// the keyed signature over the recording, the user, and the expiry, with its purpose signed beside them. a podcast
// episode's id and a Topic Post's id sign under their own names, so neither recording's token plays the other
function toPlayTokenSignature(playTokenOptions: PlayTokenOptions, expiresAt: number): string {
	return toAuthSecretSignature({
		value: toCanonicalJson({ purpose: "podcast episode plays", ...playTokenOptions, expiresAt }),
		purpose: "podcast episode plays",
		encoding: "base64url",
	})
}
