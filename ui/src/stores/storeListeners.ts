// the useSyncExternalStore boilerplate every store in this folder needs
/** One store's listener set, with the subscribe and version pair useSyncExternalStore reads. */
export function toStoreListeners(): {
	subscribe: (listener: () => void) => () => void
	publish: () => void
	getVersion: () => number
} {
	// a version instead of the value, so a snapshot stays the same between publishes and React never
	// re-renders on a fresh object it has not seen change
	const listeners = new Set<() => void>()
	let version = 0

	return {
		// add a listener for store changes, and return the call that removes it
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		// tell every subscriber the value moved
		publish: () => {
			version += 1
			for (const listener of listeners) {
				listener()
			}
		},
		getVersion: () => version,
	}
}
