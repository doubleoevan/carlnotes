// text helper tests: whitespace runs and line breaks become single spaces with the ends trimmed, and parts join on
// middle dots without the empty ones
import { expect, test } from "bun:test"
import { toDotSeparatedText, toHtmlText, toOneLineText } from "./text"

// tags go, entities decode, a link keeps its text, and the whitespace collapses
test("toHtmlText returns an html body's readable text", () => {
	expect(toHtmlText('<p>Hello &amp; <a href="https://x.test">welcome</a></p><ul><li>one</li><li>two</li></ul>')).toBe(
		"Hello & welcome one two",
	)
	expect(toHtmlText("&#169; &#x1F600; &nbsp;x &unknown;")).toBe("© 😀 x &unknown;")
})

// tabs, line breaks, and padding all collapse into one space between words
test("toOneLineText puts text on one line", () => {
	expect(toOneLineText("  a\n b \t")).toBe("a b")
	expect(toOneLineText(" \n ")).toBe("")
})

// the empty and missing parts leave no extra dot
test("toDotSeparatedText joins the parts it has on middle dots", () => {
	expect(toDotSeparatedText(["example.com", null, "3w", "", undefined])).toBe("example.com · 3w")
	expect(toDotSeparatedText([null])).toBe("")
})
