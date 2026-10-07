// reloads the page once if a deploy removed a chunk that the open page still asks for, so the page loads the new build

// where the time of the last reload is kept for this tab, and how soon a second failure counts as a missing chunk
const STALE_BUNDLE_RELOAD_KEY = "carlnotes:stale-bundle-reload-at"
const STALE_BUNDLE_RELOAD_WINDOW_MS = 30_000

/**
 * Reloads the page when a dynamically imported chunk fails to load, unless the page already reloaded for one moments ago
 * or the tab cannot save the time of a reload.
 */
export function reloadOnStaleBundle(): void {
	window.addEventListener("vite:preloadError", () => {
		// a chunk that is still missing right after a reload is not a stale page, so the error shows instead of a loop
		const lastReloadAt = readLastReloadAt()
		const now = Date.now()
		if (!shouldReloadForStaleBundle(lastReloadAt, now)) {
			return
		}

		// remember this reload, then load the page again on the new build. a tab that cannot save the time shows the error
		if (writeLastReloadAt(now)) {
			window.location.reload()
		}
	})
}

/**
 * Returns whether a failed chunk load should reload the page: never if the page reloaded for one within the window.
 */
export function shouldReloadForStaleBundle(lastReloadAt: number | null, now: number): boolean {
	return lastReloadAt === null || now - lastReloadAt > STALE_BUNDLE_RELOAD_WINDOW_MS
}

// the time of this tab's last reload for a stale chunk, or null if there was none or storage is blocked
function readLastReloadAt(): number | null {
	try {
		const storedReloadAt = Number(sessionStorage.getItem(STALE_BUNDLE_RELOAD_KEY))
		return storedReloadAt > 0 ? storedReloadAt : null
	} catch {
		return null
	}
}

// keep the time of this reload for the tab, and return whether storage kept it
function writeLastReloadAt(reloadAt: number): boolean {
	try {
		sessionStorage.setItem(STALE_BUNDLE_RELOAD_KEY, String(reloadAt))
		return true
	} catch {
		return false
	}
}
