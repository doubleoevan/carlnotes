// the search bar's search page, and the event that empties the bar
import { toEventListeners, toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import { useEffect } from "react"

// the search page the bar's text opens, or null while the bar holds no text long enough to search
let searchBarPath: string | null = null
const { publish, useStoreVersion } = toStoreListeners()

// the listeners told to empty the search bar
const { subscribe, announce } = toEventListeners<void>()

/**
 * Saves the search page the bar's text opens, and tells every listener if it changed.
 */
export function saveSearchBarPath(path: string | null): void {
	if (path === searchBarPath) {
		return
	}
	searchBarPath = path
	publish()
}

/**
 * Returns the search page the bar's text opens, or null, re-rendering the caller on each change.
 */
export function useSearchBarPath(): string | null {
	useStoreVersion()
	return searchBarPath
}

/**
 * Empties the search bar.
 */
export function clearSearchBar(): void {
	announce()
}

/**
 * Runs onClear each time the search bar is told to empty. onClear should keep one identity across renders.
 */
export function useSearchBarClear(onClear: () => void): void {
	useEffect(() => subscribe(onClear), [onClear])
}
