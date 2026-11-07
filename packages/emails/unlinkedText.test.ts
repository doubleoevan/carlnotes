// unlinked text tests: a url, a bare domain, and an email address stop being links, and a quote is cut and unlinked
import { expect, test } from "bun:test"
import { toEmailQuote, toUnlinkedText } from "./unlinkedText"

test("a url, a bare domain, and an email address are written with bracketed dots", () => {
	expect(toUnlinkedText("see https://evil.example.org/path?x=1 now")).toBe(
		"see https[://]evil[.]example[.]org/path?x=1 now",
	)
	expect(toUnlinkedText("go to evil.com, or mail me@evil.co.uk")).toBe("go to evil[.]com, or mail me@evil[.]co[.]uk")
})

test("a url with no dotted name, an ip address, and a domain in another script are written the same way", () => {
	expect(toUnlinkedText("log in at http://intranet/login")).toBe("log in at http[://]intranet/login")
	expect(toUnlinkedText("see http://10.0.0.1/admin or 192.168.1.1")).toBe(
		"see http[://]10[.]0[.]0[.]1/admin or 192[.]168[.]1[.]1",
	)
	expect(toUnlinkedText("go to пример.рф")).toBe("go to пример[.]рф")
})

test("ordinary sentences are unchanged", () => {
	expect(toUnlinkedText("So true. I agree, e.g. with point 2.5 and v1.2")).toBe(
		"So true. I agree, e.g. with point 2.5 and v1.2",
	)
})

test("a quote is one line, cut with an ellipsis, and unlinked", () => {
	expect(toEmailQuote("first\nsecond   third", 100)).toBe("first second third")
	expect(toEmailQuote("x".repeat(200), 140)).toBe(`${"x".repeat(139)}…`)
	expect(toEmailQuote("read evil.com", 100)).toBe("read evil[.]com")
})
