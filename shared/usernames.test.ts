// username rules: the shape, the validator, the comparison form, and the pairs that read as mistakes
import { describe, expect, it } from "bun:test"
import {
	hasSharedStem,
	toNormalizedUsername,
	toUsernameCandidates,
	toUsernameRejection,
	toUsernameWithDigits,
	USERNAME_COMBINATIONS,
	USERNAME_MAX_LENGTH,
} from "./usernames"

// the combination space has to be large enough that a collision, and so a digit suffix, is the exception.
describe("the word lists", () => {
	it("makes enough combinations that digits stay the exception", () => {
		expect(USERNAME_COMBINATIONS).toBeGreaterThanOrEqual(1000)
	})

	// the cap has to clear the longest pair the lists can draw plus its four-digit suffix
	it("cannot draw a pair longer than the cap allows", () => {
		for (const candidate of toUsernameCandidates(60)) {
			expect(toUsernameWithDigits(candidate).length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH)
		}
	})
})

describe("toNormalizedUsername", () => {
	// one normalized canonical username to check for duplication
	it("folds separators and case to one comparison form", () => {
		expect(toNormalizedUsername("SlowRoasted")).toBe("slowroasted")
		expect(toNormalizedUsername("slow-roasted")).toBe("slowroasted")
		expect(toNormalizedUsername("slow_roasted")).toBe("slowroasted")
	})

	// check for spaces and case insensitivity
	it("folds compatibility forms with NFKC", () => {
		expect(toNormalizedUsername("Ｃａｒｌ")).toBe("carl")
	})
})

describe("toUsernameRejection", () => {
	it("accepts a well-formed username", () => {
		expect(toUsernameRejection("Bright-Macchiato")).toBeNull()
		expect(toUsernameRejection("bright_macchiato")).toBeNull()
	})

	it("refuses anything outside the length range", () => {
		expect(toUsernameRejection("ab")).toBe("length")
		expect(toUsernameRejection("a".repeat(USERNAME_MAX_LENGTH + 1))).toBe("length")
	})

	// a cyrillic lookalike does not fold to latin, so the character check is what stops the impersonation
	it("refuses confusables and anything else outside the character set", () => {
		expect(toUsernameRejection("Саrl-Notes")).toBe("charset")
		expect(toUsernameRejection("carl.notes")).toBe("charset")
		expect(toUsernameRejection("carl notes")).toBe("charset")
	})

	it("refuses a leading or trailing separator", () => {
		expect(toUsernameRejection("-carl-")).toBe("separator")
		expect(toUsernameRejection("_reader")).toBe("separator")
	})

	// the reserved username list runs on the normalized form
	it("refuses a reserved word however it is punctuated", () => {
		expect(toUsernameRejection("carl")).toBe("reserved")
		expect(toUsernameRejection("CARL")).toBe("reserved")
		expect(toUsernameRejection("c-a-r-l")).toBe("reserved")
		expect(toUsernameRejection("notes_of_carl")).toBe("reserved")
	})

	it("refuses the names that would pass someone off as the site or its staff", () => {
		for (const name of ["carl", "carlnotes", "notesofcarl", "admin", "support"]) {
			expect(toUsernameRejection(name)).toBe("reserved")
		}
	})

	it("allows a route segment, since a profile is addressed by id and a username is never a path", () => {
		for (const segment of ["topics", "pricing", "account", "activity", "settings", "explore", "profiles"]) {
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

describe("toUsernameCandidates", () => {
	// a candidate is offered bare, since digits are only ever the last resort
	it("returns distinct Adjective-Noun candidates with no digits", () => {
		const candidates = toUsernameCandidates(5)
		expect(candidates.length).toBe(5)
		expect(new Set(candidates).size).toBe(5)
		for (const candidate of candidates) {
			expect(candidate).toMatch(/^[A-Za-z]+-[A-Za-z]+$/)
		}
	})

	it("never offers a rejected or stem-sharing pair", () => {
		for (const candidate of toUsernameCandidates(100)) {
			const [adjective, noun] = candidate.split("-") as [string, string]
			expect(toUsernameRejection(candidate)).toBeNull()
			expect(hasSharedStem(adjective, noun)).toBe(false)
		}
	})
})

describe("toUsernameWithDigits", () => {
	it("appends exactly four digits to break a collision", () => {
		expect(toUsernameWithDigits("Bright-Macchiato")).toMatch(/^Bright-Macchiato-\d{4}$/)
	})
})

// profiles live under /profiles/:userId, so no username cannot shadow a path
describe("routes added by later changes", () => {
	it("needs no reservation for a new route segment", () => {
		expect(toUsernameRejection("reset-password")).toBeNull()
		expect(toUsernameRejection("resetpassword")).toBeNull()
	})
})
