// the useSyncExternalStore boilerplate every store in this folder needs, and the listeners a store tells of an event
import { useSyncExternalStore } from "react"

/**
 * Returns one store's publish call, the hook that re-renders a component on each publish, and the subscribe call for a
 * hook that re-renders only when its own snapshot changes.
 */
export function toStoreListeners(): {
	publish: () => void
	useStoreVersion: () => number
	subscribe: (listener: () => void) => () => void
} {
	// a version instead of the value, so a snapshot stays the same between publishes and React never
	// re-renders on a fresh object it has not seen change
	const { subscribe, announce } = toEventListeners<void>()
	let version = 0

	// the store's version, the snapshot in the browser and on the server alike
	const getVersion = (): number => version

	return {
		// notify every subscriber that the value changed
		publish: () => {
			version += 1
			announce()
		},
		// subscribe a calling component to the store
		useStoreVersion: () => useSyncExternalStore(subscribe, getVersion, getVersion),
		subscribe,
	}
}

/**
 * Returns one event's subscribe call, which returns the unsubscribe, and the announce call that tells every listener.
 */
export function toEventListeners<EventPayload>(): {
	subscribe: (listener: (eventPayload: EventPayload) => void) => () => void
	announce: (eventPayload: EventPayload) => void
} {
	const listeners = new Set<(eventPayload: EventPayload) => void>()
	return {
		// add a listener for the event, and return the call that removes it
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		// tell every listener about the event
		announce: (eventPayload) => {
			for (const listener of listeners) {
				listener(eventPayload)
			}
		},
	}
}
