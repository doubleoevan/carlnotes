// username rules: the shape, the validator, the comparison form, and the pairs that read as mistakes
import { describe, expect, it } from "bun:test"
import {
	hasSharedStem,
	RESERVED_USERNAMES,
	toNormalizedUsername,
	toProposedUsernames,
	toUsernameRejection,
	toUsernameWithDigits,
	USERNAME_COMBINATIONS,
	USERNAME_MAX_LENGTH,
} from "./usernames"
import { USERNAME_ADJECTIVES, USERNAME_NOUNS } from "./usernameWords"

// the combination space has to be large enough that a collision, and so a digit suffix, is the exception.
describe("the word lists", () => {
	it("makes enough combinations that digits stay the exception", () => {
		expect(USERNAME_COMBINATIONS).toBeGreaterThanOrEqual(1000)
	})

	// the limit has to clear the longest pair the lists can draw plus its four-digit suffix
	it("cannot draw a pair longer than the limit allows", () => {
		for (const proposal of toProposedUsernames(60)) {
			expect(toUsernameWithDigits(proposal).length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH)
		}
	})
})

describe("toNormalizedUsername", () => {
	// one normalized username to check for duplication
	it("folds separators and case to one comparison form", () => {
		expect(toNormalizedUsername("SlowRoasted")).toBe("slowroasted")
		expect(toNormalizedUsername("slow-roasted")).toBe("slowroasted")
		expect(toNormalizedUsername("slow_roasted")).toBe("slowroasted")
	})

	it("folds compatibility forms with NFKC", () => {
		expect(toNormalizedUsername("Ｃａｒｌ")).toBe("carl")
	})
})

describe("toUsernameRejection", () => {
	it("accepts a well-formed username", () => {
		expect(toUsernameRejection("Bright-Macchiato")).toBeNull()
		expect(toUsernameRejection("bright_macchiato")).toBeNull()
	})

	it("rejects anything outside the length range", () => {
		expect(toUsernameRejection("ab")).toBe("length")
		expect(toUsernameRejection("a".repeat(USERNAME_MAX_LENGTH + 1))).toBe("length")
	})

	// a cyrillic lookalike does not fold to latin, so the character check is what stops the impersonation
	it("rejects confusables and anything else outside the character set", () => {
		expect(toUsernameRejection("Саrl-Notes")).toBe("charset")
		expect(toUsernameRejection("carl.notes")).toBe("charset")
		expect(toUsernameRejection("carl notes")).toBe("charset")
	})

	it("rejects a leading or trailing separator", () => {
		expect(toUsernameRejection("-carl-")).toBe("separator")
		expect(toUsernameRejection("_reader")).toBe("separator")
	})

	// the reserved username list runs on the normalized form
	it("rejects a reserved word however it is punctuated", () => {
		expect(toUsernameRejection("carl")).toBe("reserved")
		expect(toUsernameRejection("CARL")).toBe("reserved")
		expect(toUsernameRejection("c-a-r-l")).toBe("reserved")
		expect(toUsernameRejection("notes_of_carl")).toBe("reserved")
	})

	it("rejects the names that would pass someone off as the site or its staff", () => {
		for (const name of ["carl", "carlnotes", "notesofcarl", "admin", "support"]) {
			expect(toUsernameRejection(name)).toBe("reserved")
		}
	})

	it("rejects every route slug, reserved ahead of any vanity-url work", () => {
		for (const segment of ["topics", "pricing", "account", "activity", "settings", "profiles", "teams", "login"]) {
			expect(toUsernameRejection(segment)).toBe("reserved")
		}
	})

	it("allows a plain word that is not a route", () => {
		for (const segment of ["explore", "espresso", "raccoon"]) {
			expect(toUsernameRejection(segment)).toBeNull()
		}
	})
})

describe("hasSharedStem", () => {
	// stem-sharing username pairs the current lists could actually generate
	it("catches the pairs that read as mistakes", () => {
		expect(hasSharedStem("Roasted", "Roast")).toBe(true)
		expect(hasSharedStem("DarkRoasted", "Roast")).toBe(true)
		expect(hasSharedStem("SlowRoasted", "Roast")).toBe(true)
		expect(hasSharedStem("ColdBrewed", "Brew")).toBe(true)
		expect(hasSharedStem("ColdBrewed", "ColdBrew")).toBe(true)
	})

	// neither word contains the other, so only stemming past the suffix catches this one
	it("catches a pair that shares a stem without containing it", () => {
		expect(hasSharedStem("WellRead", "Reader")).toBe(true)
	})

	it("leaves an ordinary pair alone", () => {
		expect(hasSharedStem("Bright", "Macchiato")).toBe(false)
		expect(hasSharedStem("Insomniac", "Raccoon")).toBe(false)
	})
})

describe("toProposedUsernames", () => {
	// a proposal is offered bare, with digits only ever the last resort
	it("returns distinct Adjective-Noun proposals with no digits", () => {
		const proposals = toProposedUsernames(5)
		expect(proposals.length).toBe(5)
		expect(new Set(proposals).size).toBe(5)
		for (const proposal of proposals) {
			expect(proposal).toMatch(/^[A-Za-z]+-[A-Za-z]+$/)
		}
	})

	it("never offers a rejected or stem-sharing pair", () => {
		for (const proposal of toProposedUsernames(100)) {
			const [adjective, noun] = proposal.split("-") as [string, string]
			expect(toUsernameRejection(proposal)).toBeNull()
			expect(hasSharedStem(adjective, noun)).toBe(false)
		}
	})
})

describe("toUsernameWithDigits", () => {
	it("appends exactly four digits to break a collision", () => {
		expect(toUsernameWithDigits("Bright-Macchiato")).toMatch(/^Bright-Macchiato-\d{4}$/)
	})
})

// the reserved check runs on the normalized form, so separator spellings of a route are caught too
describe("routes added by later changes", () => {
	it("catches a route slug in any separator spelling", () => {
		expect(toUsernameRejection("reset-password")).toBe("reserved")
		expect(toUsernameRejection("resetpassword")).toBe("reserved")
		expect(toUsernameRejection("Reset_Password")).toBe("reserved")
	})
})

describe("reserved usernames", () => {
	// the two names the app speaks with: @carl is Carl himself and @all addresses a whole room
	it("refuses carl and all in every spelling", () => {
		for (const spelling of ["carl", "CARL", "c-a-r-l", "C_a_R_l", "all", "A_L_L", "a-l-l"]) {
			expect(toUsernameRejection(spelling)).toBe("reserved")
		}
	})

	// the generator hands out names without asking the validator, so its own word pairs are checked here
	it("never generates a name that spells a reserved one", () => {
		const clashes = USERNAME_ADJECTIVES.flatMap((adjective) =>
			USERNAME_NOUNS.map((noun) => `${adjective}-${noun}`).filter((name) =>
				RESERVED_USERNAMES.has(toNormalizedUsername(name)),
			),
		)
		expect(clashes).toEqual([])
	})
})
