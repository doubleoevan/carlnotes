import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

/**
 * Returns a value read from the browser before the first paint. The server render and a component's first browser
 * render use the fallback. readBrowserValue must be a module-scope function, or the effect reads it again every render.
 */
export function useBrowserValue<T>(readBrowserValue: () => T, fallback: T): T {
	const [browserValue, setBrowserValue] = useState(fallback)
	useLayoutEffect(() => setBrowserValue(readBrowserValue()), [readBrowserValue])
	return browserValue
}

/**
 * The page's own origin, or an empty string until the browser has read it.
 */
export function useOrigin(): string {
	return useBrowserValue(readOrigin, "")
}

/**
 * Whether the component has mounted in the browser. False on the server and in the component's first render.
 */
export function useIsMounted(): boolean {
	return useBrowserValue(readIsMounted, false)
}

/**
 * Whether this render is the server render or the browser's hydration of it. A component the browser mounts after
 * hydration reads false.
 */
export function useIsHydrating(): boolean {
	return useSyncExternalStore(subscribeToNothing, readBrowserSnapshot, readServerSnapshot)
}

// a page's id, whether the server loaded the value for that page id, and the read that loads it in the browser
type UseLoadInBrowserOptions = { pageId: string | undefined; isLoadedOnServer: boolean; loadPage: () => void }

/**
 * Runs a page's load on mount and on each new page id, and skips the first run while hydrating a value the server
 * loaded for that page id. loadPage must keep its identity for one page id.
 */
export function useLoadInBrowser({ pageId, isLoadedOnServer, loadPage }: UseLoadInBrowserOptions): void {
	// the page id whose value the server loaded, set only while hydrating. the first run skips loading that page id
	const isHydrating = useIsHydrating()
	const serverLoadedPageIdRef = useRef(isHydrating && isLoadedOnServer ? pageId : undefined)

	// load on mount and on each new page id, except for the server-loaded page id
	useEffect(() => {
		if (serverLoadedPageIdRef.current === pageId) {
			return
		}
		// forget the server-loaded page id. a later return to that page id loads again
		serverLoadedPageIdRef.current = undefined
		loadPage()
	}, [pageId, loadPage])
}

// the page's own origin
function readOrigin(): string {
	return window.location.origin
}

// true once the component has mounted in the browser
function readIsMounted(): boolean {
	return true
}

// a store that never changes. useIsHydrating reads only which snapshot React picks
function subscribeToNothing(): () => void {
	return () => {}
}

// the snapshot a browser render reads after hydration
function readBrowserSnapshot(): boolean {
	return false
}

// the snapshot the server render and the browser's hydration read
function readServerSnapshot(): boolean {
	return true
}
