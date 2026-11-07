import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * Wraps a callback the parent recreates every render in one function whose identity never changes.
 */
export function useStableCallback<Args extends unknown[]>(callback: (...args: Args) => void): (...args: Args) => void {
	// the ref keeps the latest callback while the returned function stays the same, updated after the render commits
	const callbackRef = useRef(callback)
	useLayoutEffect(() => {
		callbackRef.current = callback
	}, [callback])
	return useCallback((...args: Args) => callbackRef.current(...args), [])
}
