// share sheet tests: what the browser returns, and when a row may be drawn at all
import { afterEach, expect, test } from "bun:test"
import { canOpenShareSheet, openShareSheet } from "./shareSheet"

// the payload every test case gives the sheet
const SHARE = { title: "Cute raccoon videos", text: "Join it", url: "https://carlnotes.com/join/abc" }

// set up the two browser globals the helper reads, and return what was called
function withBrowser({ share, isCoarsePointer }: { share?: unknown; isCoarsePointer?: boolean }): { calls: unknown[] } {
	const calls: unknown[] = []
	// navigator.share is absent unless the test case supplies one, which is the desktop Firefox shape
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: share === undefined ? {} : { share: toRecordedShare(share as () => Promise<void>, calls) },
	})
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { matchMedia: () => ({ matches: isCoarsePointer ?? false }) },
	})
	return { calls }
}

// the stand-in for navigator.share, which records what it was given before returning what the test case wants
function toRecordedShare(share: () => Promise<void>, calls: unknown[]): (payload: unknown) => Promise<void> {
	return (payload) => {
		calls.push(payload)
		return share()
	}
}

// each test case installs its own globals, so that none of them leak into the next
afterEach(() => {
	Reflect.deleteProperty(globalThis, "window")
})

// a browser with no share api returns unavailable without calling anything, which is the copy fallback's cue
test("openShareSheet reports unavailable where the api is absent", async () => {
	const { calls } = withBrowser({})
	expect(await openShareSheet(SHARE)).toBe("unavailable")
	expect(calls).toHaveLength(0)
})

// a completed share is the only response that means the person selected something
test("openShareSheet reports a completed share, with the payload it was given", async () => {
	const { calls } = withBrowser({ share: () => Promise.resolve() })
	expect(await openShareSheet(SHARE)).toBe("shared")
	expect(calls).toEqual([SHARE])
})

// dismissing the sheet is a decision, so it must not read as a failure and must not copy anything
test("openShareSheet reports a dismissal apart from a refusal", async () => {
	const abort = Object.assign(new Error("cancelled"), { name: "AbortError" })
	withBrowser({ share: () => Promise.reject(abort) })
	expect(await openShareSheet(SHARE)).toBe("dismissed")
})

// a browser refusing the gesture takes the same exit as a missing api, which is what the copy fallback covers
test("openShareSheet reports a rejected gesture as unavailable", async () => {
	const rejected = Object.assign(new Error("gesture"), { name: "NotAllowedError" })
	withBrowser({ share: () => Promise.reject(rejected) })
	expect(await openShareSheet(SHARE)).toBe("unavailable")
})

// the share sheet is only shown when a sheet both exists and is worth offering, which is on mobile
test("canOpenShareSheet requires the api and a coarse pointer", () => {
	withBrowser({ share: () => Promise.resolve(), isCoarsePointer: true })
	expect(canOpenShareSheet()).toBe(true)

	// a desktop browser that has the api still gets no sheet
	withBrowser({ share: () => Promise.resolve(), isCoarsePointer: false })
	expect(canOpenShareSheet()).toBe(false)

	// and a touch device whose browser has no sheet gets none either
	withBrowser({ isCoarsePointer: true })
	expect(canOpenShareSheet()).toBe(false)
})
