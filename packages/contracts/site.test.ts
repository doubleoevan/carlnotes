// site tests: the site's own url is the origin or a path after it, never a look-alike host or a url that only
// includes the origin
import { expect, test } from "bun:test"
import { isSiteUrl } from "./site"

test("isSiteUrl accepts the origin and its paths and rejects look-alike hosts", () => {
	expect(isSiteUrl("https://carlnotes.com")).toBe(true)
	expect(isSiteUrl("https://carlnotes.com/topics/x")).toBe(true)
	expect(isSiteUrl("https://carlnotes.com.evil/x")).toBe(false)
	expect(isSiteUrl("https://evil/https://carlnotes.com/")).toBe(false)
})
