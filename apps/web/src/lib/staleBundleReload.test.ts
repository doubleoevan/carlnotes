// stale bundle reload tests: when a failed chunk load reloads the page
import { expect, test } from "bun:test"
import { isStaleBundleError, shouldReloadForStaleBundle } from "./staleBundleReload"

// the first failure reloads, a second failure moments later does not, and a later one reloads again
test("shouldReloadForStaleBundle reloads once, then waits out the window", () => {
	const now = 1_000_000
	expect(shouldReloadForStaleBundle(null, now)).toBe(true)
	expect(shouldReloadForStaleBundle(now - 5_000, now)).toBe(false)
	expect(shouldReloadForStaleBundle(now - 60_000, now)).toBe(true)
})

// each browser's message for a missing page file counts, and any other error does not
test("isStaleBundleError matches each browser's missing module message", () => {
	expect(
		isStaleBundleError(new TypeError("Failed to fetch dynamically imported module: https://carlnotes.com/a.js")),
	).toBe(true)
	expect(isStaleBundleError(new TypeError("Importing a module script failed."))).toBe(true)
	expect(
		isStaleBundleError(new TypeError("error loading dynamically imported module: https://carlnotes.com/a.js")),
	).toBe(true)
	expect(isStaleBundleError(new Error("Network request failed"))).toBe(false)
	expect(isStaleBundleError("Failed to fetch dynamically imported module")).toBe(false)
})
