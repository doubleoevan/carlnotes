import { afterEach, beforeEach, expect, test } from "bun:test"
import { toViewerElement } from "./viewerElements"

// the auth secret the hash is keyed by, set for each test and put back after
let savedAuthSecret: string | undefined

beforeEach(() => {
	savedAuthSecret = Bun.env.BETTER_AUTH_SECRET
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

afterEach(() => {
	Bun.env.BETTER_AUTH_SECRET = savedAuthSecret
})

test("a signed-in user counts by their id, whatever their address", () => {
	expect(toViewerElement({ userId: "user-1", clientAddress: null, userAgent: null })).toBe("u:user-1")
})

test("a visitor counts by a hash that holds neither their address nor their user agent", () => {
	const element = toViewerElement({ userId: null, clientAddress: "203.0.113.7", userAgent: "Firefox" })
	expect(element?.startsWith("v:")).toBe(true)
	expect(element).not.toContain("203.0.113.7")
	expect(element).not.toContain("Firefox")

	// the same address and user agent count as the same visitor, and another user agent as another
	expect(toViewerElement({ userId: null, clientAddress: "203.0.113.7", userAgent: "Firefox" })).toBe(element)
	expect(toViewerElement({ userId: null, clientAddress: "203.0.113.7", userAgent: "Safari" })).not.toBe(element)
})

test("a visitor with no address or no auth secret counts as nobody", () => {
	expect(toViewerElement({ userId: null, clientAddress: null, userAgent: "Firefox" })).toBeNull()
	Bun.env.BETTER_AUTH_SECRET = ""
	expect(toViewerElement({ userId: null, clientAddress: "203.0.113.7", userAgent: "Firefox" })).toBeNull()
})
