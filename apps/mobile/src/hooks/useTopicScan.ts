import { startActivePoll } from "@carlnotes/core/lib/activePoll"
import { focusManager, onlineManager } from "@tanstack/react-query"
import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useRef } from "react"

/**
 * Polls a running scan while its route is focused and the app is active and online, at the caller's rates.
 */
export function usePollWhileScanning({
	isScanning,
	reload,
	toPollMs,
}: {
	isScanning: boolean
	reload: () => Promise<void>
	toPollMs: (watchedMs: number) => number
}): void {
	// retain the in-flight request across focus changes and updated callbacks
	const reloadRef = useRef(reload)
	useEffect(() => {
		reloadRef.current = reload
	}, [reload])

	// track route focus separately from app and network activity
	const isFocused = useRef(false)
	const activityChanged = useRef<(() => void) | null>(null)

	// mark the route focused while it shows, and tell the poll each time that changes
	useFocusEffect(
		useCallback(() => {
			isFocused.current = true
			activityChanged.current?.()
			return () => {
				isFocused.current = false
				activityChanged.current?.()
			}
		}, []),
	)

	// share the web's backoff and serialized requests while adapting native lifecycle events
	useEffect(() => {
		if (!isScanning) {
			return
		}
		return startActivePoll({
			reload: () => reloadRef.current(),
			toPollMs,
			isActive: () => isFocused.current && focusManager.isFocused() && onlineManager.isOnline(),
			subscribe: (listener) => {
				activityChanged.current = listener
				const unsubscribeFocus = focusManager.subscribe(listener)
				const unsubscribeOnline = onlineManager.subscribe(listener)

				// the unsubscribe drops every listener
				return () => {
					activityChanged.current = null
					unsubscribeFocus()
					unsubscribeOnline()
				}
			},
		})
	}, [isScanning, toPollMs])
}
