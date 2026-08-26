// the avatar image: which letters a username draws, which tint a user id selects, and the contrast the palette can hold
import { describe, expect, it } from "bun:test"
import { AVATAR_COLOR, AVATAR_TINT_MAX_LUMINANCE, AVATAR_TINTS, toAvatarInitials, toAvatarTint } from "./avatars"

// WCAG relative luminance for visibility
function toRelativeLuminance(hex: string): number {
	const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
	const [red, green, blue] = channels.map((channel) =>
		channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	) as [number, number, number]
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

// the contrast ratio between two colors, which is what the text has to clear against every tint
function toContrastRatio(first: string, second: string): number {
	const [lighter, darker] = [toRelativeLuminance(first), toRelativeLuminance(second)].sort((a, b) => b - a) as [
		number,
		number,
	]
	return (lighter + 0.05) / (darker + 0.05)
}

describe("toAvatarInitials", () => {
	// a team name is spaced instead of hyphenated, and reads its first two words the same way
	it("reads a spaced team name", () => {
		expect(toAvatarInitials("Agent Infra Crew")).toBe("AI")
		expect(toAvatarInitials("My reading team")).toBe("MR")
		// one word still has only its own first letter to give
		expect(toAvatarInitials("Raccoons")).toBe("R")
	})

	it("takes one letter from each half of the username", () => {
		expect(toAvatarInitials("Bright-Macchiato")).toBe("BM")
		expect(toAvatarInitials("Slow-Postscript")).toBe("SP")
	})

	// the digits break a collision but do not affect the initials
	it("ignores the collision suffix", () => {
		expect(toAvatarInitials("Bright-Macchiato-0421")).toBe("BM")
	})

	// underscores are the other separator the username rules allow
	it("splits on underscores too", () => {
		expect(toAvatarInitials("cool_dude")).toBe("CD")
	})

	// a typed username is often one word so show the first letter
	it("takes the single letter of a one-word username", () => {
		expect(toAvatarInitials("cooldude")).toBe("C")
		expect(toAvatarInitials("Bright")).toBe("B")
	})

	// two letters from one word would read as a syllable instead of as initials
	it("never slices two letters out of a single word", () => {
		expect(toAvatarInitials("Bright-Macchiato")).not.toBe("BR")
		expect(toAvatarInitials("cooldude")).not.toBe("CO")
	})
})

describe("toAvatarTint", () => {
	it("gives the same user the same tint every time", () => {
		expect(toAvatarTint("user_abc")).toBe(toAvatarTint("user_abc"))
	})

	it("returns a tint from the palette", () => {
		expect(AVATAR_TINTS as readonly string[]).toContain(toAvatarTint("user_abc"))
	})

	// the color is anchored to the id, so changing a username moves the letters and leaves the color alone
	it("does not depend on the username or the letters", () => {
		const tints = ["user_1", "user_2", "user_3", "user_4", "user_5", "user_6", "user_7", "user_8"].map(toAvatarTint)
		expect(new Set(tints).size).toBeGreaterThan(1)
	})
})

describe("the palette", () => {
	// a tint added later must stay inside the range
	it("keeps every tint at or below the luminance limit", () => {
		for (const tint of AVATAR_TINTS) {
			expect(toRelativeLuminance(tint)).toBeLessThanOrEqual(AVATAR_TINT_MAX_LUMINANCE)
		}
	})

	// keep the contrast ratio above 4.5:1 on every tint
	it("clears accessibility for normal text on every tint", () => {
		for (const tint of AVATAR_TINTS) {
			expect(toContrastRatio(AVATAR_COLOR, tint)).toBeGreaterThanOrEqual(4.5)
		}
	})
})
