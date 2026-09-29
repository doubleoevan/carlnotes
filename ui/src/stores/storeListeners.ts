// the useSyncExternalStore boilerplate every store in this folder needs
import { useSyncExternalStore } from "react"

/**
 * Returns one store's publish call and the hook that re-renders a component on each publish.
 */
export function toStoreListeners(): {
	publish: () => void
	useStoreVersion: () => number
} {
	// a version instead of the value, so a snapshot stays the same between publishes and React never
	// re-renders on a fresh object it has not seen change
	const listeners = new Set<() => void>()
	let version = 0

	// add a listener for store changes, and return the call that removes it
	const subscribe = (listener: () => void): (() => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}

	// the store's version, the snapshot in the browser and on the server alike
	const getVersion = (): number => version

	return {
		// notify every subscriber that the value changed
		publish: () => {
			version += 1
			for (const listener of listeners) {
				listener()
			}
		},
		// subscribe a calling component to the store
		useStoreVersion: () => useSyncExternalStore(subscribe, getVersion, getVersion),
	}
}
