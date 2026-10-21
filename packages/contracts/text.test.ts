// one line text tests: whitespace runs and line breaks become single spaces, and the ends are trimmed
import { expect, test } from "bun:test"
import { toOneLineText } from "./text"

// tabs, line breaks, and padding all collapse into one space between words
test("toOneLineText puts text on one line", () => {
	expect(toOneLineText("  a\n b \t")).toBe("a b")
	expect(toOneLineText(" \n ")).toBe("")
})
