// stale bundle reload tests: when a failed chunk load reloads the page
import { expect, test } from "bun:test"
import { shouldReloadForStaleBundle } from "./staleBundleReload"

// the first failure reloads, a second failure moments later does not, and a later one reloads again
test("shouldReloadForStaleBundle reloads once, then waits out the window", () => {
	const now = 1_000_000
	expect(shouldReloadForStaleBundle(null, now)).toBe(true)
	expect(shouldReloadForStaleBundle(now - 5_000, now)).toBe(false)
	expect(shouldReloadForStaleBundle(now - 60_000, now)).toBe(true)
})
