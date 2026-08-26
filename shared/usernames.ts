// how a username is shaped, what makes it valid, and how two usernames are compared
import { USERNAME_ADJECTIVES, USERNAME_NOUNS } from "./usernameWords"

// the range that a username length can take
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32

/**
 * The number of Adjective-Noun pairs the lists can make.
 */
export const USERNAME_COMBINATIONS = USERNAME_ADJECTIVES.length * USERNAME_NOUNS.length

// the names no username may take
export const RESERVED_USERNAMES = new Set([
	// names that would pass someone off as the site or its staff
	"carl",
	// the room-wide mention, so @all can never name a person
	"all",
	"carlnotes",
	"notesofcarl",
	"admin",
	"support",
	// the root routes the app serves
	"login",
	"signup",
	"join",
	"invite",
	"resetpassword",
	"api",
	"topics",
	"teams",
	"activity",
	"account",
	"plans",
	"privacy",
	"profiles",
	"terms",
	"blog",
	"docs",
	"pricing",
	"assets",
	"screenshots",
	// reserved ahead of need
	"settings",
	"t",
])

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
	const nfkcUsername = username.normalize("NFKC")
	if (nfkcUsername.length < USERNAME_MIN_LENGTH || nfkcUsername.length > USERNAME_MAX_LENGTH) {
		return "length"
	}

	// ascii letters, digits, and the two separators. everything else, confusables included, stops here
	if (!/^[a-zA-Z0-9_-]+$/.test(nfkcUsername)) {
		return "charset"
	}

	// a leading or trailing separator reads as a typo and makes -carl- look different from carl
	if (/^[-_]|[-_]$/.test(nfkcUsername)) {
		return "separator"
	}

	// the reserved username list is checked on the normalized form, so c-a-r-l and CARL are rejected alongside carl
	return RESERVED_USERNAMES.has(toNormalizedUsername(nfkcUsername)) ? "reserved" : null
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
 * A batch of suggested usernames in the shape Adjective-Noun, for checking against the ones already taken.
 * Reserved and stem-sharing pairs are filtered out here, so a caller only sees suggestions it could assign.
 */
export function toProposedUsernames(limit: number): string[] {
	// create suggested usernames until we reach the limit, deduplicating
	const suggestedUsernames = new Set<string>()
	for (let attempt = 0; attempt < limit * 20 && suggestedUsernames.size < limit; attempt++) {
		const adjective = toRandomWord(USERNAME_ADJECTIVES)
		const noun = toRandomWord(USERNAME_NOUNS)
		// a stem-sharing pair is re-rolled instead of offered
		if (hasSharedStem(adjective, noun)) {
			continue
		}
		// only a name the validator accepts is offered
		const username = `${adjective}-${noun}`
		if (!toUsernameRejection(username)) {
			suggestedUsernames.add(username)
		}
	}
	return [...suggestedUsernames]
}

/**
 * The same username with four random digits appended.
 * Digits are used to break ties between proposals.
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
		(proposal) => lowered.endsWith(proposal) && lowered.length - proposal.length >= 3,
	).sort((first, second) => second.length - first.length)[0]
	return suffix ? lowered.slice(0, -suffix.length) : lowered
}

// one word from a list, drawn uniformly
function toRandomWord(words: readonly string[]): string {
	return words[Math.floor(Math.random() * words.length)] as string
}
