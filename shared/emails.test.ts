// tests to verify a Gmail address gets converted to its canonical form for duplicate detection.
import { describe, expect, it } from "bun:test"
import { toCanonicalEmail } from "./emails"

describe("toCanonicalEmail", () => {
	it("strips dots from a gmail address", () => {
		expect(toCanonicalEmail("evan.tsao.author@gmail.com")).toBe("evantsaoauthor@gmail.com")
	})

	it("drops a +tag from a gmail address", () => {
		expect(toCanonicalEmail("evan+work@gmail.com")).toBe("evan@gmail.com")
	})

	it("combines dot and +tag stripping", () => {
		expect(toCanonicalEmail("e.van+tag@gmail.com")).toBe("evan@gmail.com")
	})

	it("folds googlemail.com onto gmail.com", () => {
		expect(toCanonicalEmail("e.van@googlemail.com")).toBe("evan@gmail.com")
	})

	it("lowercases a gmail address", () => {
		expect(toCanonicalEmail("Evan.Tsao@GMAIL.com")).toBe("evantsao@gmail.com")
	})

	// dots and +tags are only meaningless on gmail's own mail servers, so every other provider keeps them
	it("leaves a non-gmail address alone beyond lowercasing", () => {
		expect(toCanonicalEmail("First.Last+tag@Outlook.com")).toBe("first.last+tag@outlook.com")
	})

	it("is idempotent", () => {
		const canonical = toCanonicalEmail("evan.tsao.author@gmail.com")
		expect(toCanonicalEmail(canonical)).toBe(canonical)
	})
})
