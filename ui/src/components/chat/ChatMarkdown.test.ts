// the guard for links that a model wrote. web schemes only, so a reply can never render a script into a click
import { expect, test } from "bun:test"
import { isSafeHref } from "./ChatMarkdown"

// http and https render as live links
test("web schemes are safe", () => {
	expect(isSafeHref("https://example.com/post")).toBe(true)
	expect(isSafeHref("http://example.com")).toBe(true)
})

// every other scheme renders as plain text and never a clickable link
test("script and data schemes are rejected", () => {
	expect(isSafeHref("javascript:alert(1)")).toBe(false)
	// biome-ignore lint/suspicious/noTemplateCurlyInString: a literal attack string, not an interpolation
	expect(isSafeHref("data:text/html,<script>${'x'}</script>")).toBe(false)
	expect(isSafeHref("vbscript:msgbox")).toBe(false)
	expect(isSafeHref("file:///etc/passwd")).toBe(false)
	expect(isSafeHref(undefined)).toBe(false)
	expect(isSafeHref("")).toBe(false)
})
