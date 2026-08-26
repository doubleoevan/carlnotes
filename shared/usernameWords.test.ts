// the word lists are hand-edited, so these tests guard the properties that can quietly break
import { expect, test } from "bun:test"
import { USERNAME_ADJECTIVES, USERNAME_NOUNS } from "./usernameWords"

// count the username combinations by multiplying the lists
test("the lists make enough combinations that digits stay the exception", () => {
	expect(USERNAME_ADJECTIVES.length * USERNAME_NOUNS.length).toBeGreaterThanOrEqual(1000)
})

test("neither list repeats a word", () => {
	expect(new Set(USERNAME_ADJECTIVES).size).toBe(USERNAME_ADJECTIVES.length)
	expect(new Set(USERNAME_NOUNS).size).toBe(USERNAME_NOUNS.length)
})

// a username is split on its dash to take initials and to read as two words, so no word may have one.
test("no word contains a dash, whitespace, or a digit", () => {
	for (const word of [...USERNAME_ADJECTIVES, ...USERNAME_NOUNS]) {
		expect(word).toMatch(/^[A-Z][A-Za-z]+$/)
	}
})

// the app's domain nouns that a username must not include to avoid confusion
test("no username noun collides with the domain vocabulary", () => {
	const domainNouns = new Set([
		"Topic",
		"Source",
		"Scan",
		"Resource",
		"Finding",
		"Feed",
		"Subscription",
		"Integration",
		"Bookmark",
	])
	for (const noun of USERNAME_NOUNS) {
		expect(domainNouns.has(noun)).toBe(false)
	}
})
