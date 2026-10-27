import { startActivePoll } from "@carlnotes/core/lib/activePoll"
import { toScanPollMs } from "@carlnotes/core/lib/scanPoll"
import { focusManager, onlineManager } from "@tanstack/react-query"
import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useRef } from "react"

/**
 * Polls a running scan while its route is focused and the app is active and online.
 */
export function usePollWhileScanning({
	isScanning,
	reload,
}: {
	isScanning: boolean
	reload: () => Promise<void>
}): void {
	// retain the in-flight request across focus changes and updated callbacks
	const reloadRef = useRef(reload)
	useEffect(() => {
		reloadRef.current = reload
	}, [reload])

	// track route focus separately from app and network activity
	const isFocused = useRef(false)
	const activityChanged = useRef<(() => void) | null>(null)
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
			toPollMs: toScanPollMs,
			isActive: () => isFocused.current && focusManager.isFocused() && onlineManager.isOnline(),
			subscribe: (listener) => {
				activityChanged.current = listener
				const unsubscribeFocus = focusManager.subscribe(listener)
				const unsubscribeOnline = onlineManager.subscribe(listener)
				return () => {
					activityChanged.current = null
					unsubscribeFocus()
					unsubscribeOnline()
				}
			},
		})
	}, [isScanning])
}
