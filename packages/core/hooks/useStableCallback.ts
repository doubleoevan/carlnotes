import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * Wraps a callback the parent recreates every render in one function whose identity never changes. The wrapper keeps
 * the callback's arguments and its return value.
 */
export function useStableCallback<Args extends unknown[], Result>(
	callback: (...args: Args) => Result,
): (...args: Args) => Result {
	// the ref keeps the latest callback while the returned function stays the same, updated after the render commits
	const callbackRef = useRef(callback)
	useLayoutEffect(() => {
		callbackRef.current = callback
	}, [callback])
	return useCallback((...args: Args) => callbackRef.current(...args), [])
}
