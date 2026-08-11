// how a username is shaped, what makes it valid, and how two usernames are compared
import { USERNAME_ADJECTIVES, USERNAME_NOUNS } from "./usernameWords"

// the range that a username length can take
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32

/**
 * The number of Adjective-Noun pairs the lists can make.
 */
export const USERNAME_COMBINATIONS = USERNAME_ADJECTIVES.length * USERNAME_NOUNS.length

// the names no username may take to avoid confusion
// checked against the normalized form, so c-a-r-l is caught too
const RESERVED_USERNAMES = new Set(["carl", "carlnotes", "notesofcarl", "admin", "support"])

// the suffixes that turn one word into another form of itself. strip them when checking for duplicates
const WORD_SUFFIXES = ["ed", "ing", "er", "s"]

// why a username was rejected, or null when it is valid
export type UsernameRejection = "length" | "charset" | "separator" | "reserved"

/**
 * The comparison form of a username, NFKC-folded and stripped of separators and case to check for duplicates.
 */
export function toNormalizedUsername(username: string): string {
	return username.normalize("NFKC").replaceAll(/[-_]/g, "").toLowerCase()
}

/**
 * Why a username is rejected or null if it is well-formed
 */
export function toUsernameRejection(username: string): UsernameRejection | null {
	const canonicalUsername = username.normalize("NFKC")
	if (canonicalUsername.length < USERNAME_MIN_LENGTH || canonicalUsername.length > USERNAME_MAX_LENGTH) {
		return "length"
	}

	// ascii letters, digits, and the two separators. everything else, confusables included, stops here
	if (!/^[a-zA-Z0-9_-]+$/.test(canonicalUsername)) {
		return "charset"
	}

	// a leading or trailing separator reads as a typo and makes -carl- look different from carl
	if (/^[-_]|[-_]$/.test(canonicalUsername)) {
		return "separator"
	}

	// the reserved username list is checked on the normalized form, so c-a-r-l and CARL are rejected alongside carl
	return RESERVED_USERNAMES.has(toNormalizedUsername(canonicalUsername)) ? "reserved" : null
}

/**
 * Whether two words share a stem like`Roasted-Roast` and `WellRead-Reader`
 * the first by containment, the second after both words are reduced past their suffixes.
 */
export function hasSharedStem(first: string, second: string): boolean {
	const [firstStem, secondStem] = [toWordStem(first), toWordStem(second)]
	return firstStem.includes(secondStem) || secondStem.includes(firstStem)
}

/**
 * A batch of candidate usernames in the shape Adjective-Noun, for checking against the ones already taken.
 * Reserved and stem-sharing pairs are filtered out here, so a caller only sees candidates it could assign.
 */
export function toUsernameCandidates(limit: number): string[] {
	// create candidate usernames until we reach the limit, deduplicating so that one query does not check the same candidate twice.
	const usernameCandidates = new Set<string>()
	for (let attempt = 0; attempt < limit * 20 && usernameCandidates.size < limit; attempt++) {
		const adjective = toRandomWord(USERNAME_ADJECTIVES)
		const noun = toRandomWord(USERNAME_NOUNS)
		// a stem-sharing pair is re-rolled instead of offered, since it reads as an error
		if (hasSharedStem(adjective, noun)) {
			continue
		}
		const candidate = `${adjective}-${noun}`
		if (!toUsernameRejection(candidate)) {
			usernameCandidates.add(candidate)
		}
	}
	return [...usernameCandidates]
}

/**
 * The same username with four random digits appended.
 * Digits are used to break ties between candidates.
 */
export function toUsernameWithDigits(username: string): string {
	return `${username}-${Math.floor(Math.random() * 10_000)
		.toString()
		.padStart(4, "0")}`
}

// a word reduced past the suffix that inflects it, so two forms of one word compare equal
function toWordStem(word: string): string {
	const lowered = word.toLowerCase()
	// the longest matching suffix wins, so "roasted" reduces past "ed" instead of stopping at "d"
	const suffix = WORD_SUFFIXES.filter(
		(candidate) => lowered.endsWith(candidate) && lowered.length - candidate.length >= 3,
	).sort((first, second) => second.length - first.length)[0]
	return suffix ? lowered.slice(0, -suffix.length) : lowered
}

// one word from a list, drawn uniformly
function toRandomWord(words: readonly string[]): string {
	return words[Math.floor(Math.random() * words.length)] as string
}
