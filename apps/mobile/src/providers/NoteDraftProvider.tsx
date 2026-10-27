import { useNoteBadges } from "@carlnotes/core/hooks/useNoteBadges"
import { focusManager, onlineManager } from "@tanstack/react-query"
import { useEffect } from "react"
import { activateNoteDraftAccount, useNoteDraftStore } from "@/noteDraftStorage"

/**
 * Connects account-owned draft recovery to native foreground and network events.
 */
export function NoteDraftProvider({ userId }: { userId: string | null }) {
	useNoteBadges(userId)
	const store = useNoteDraftStore()
	useEffect(() => {
		void activateNoteDraftAccount(userId)
	}, [userId])
	useEffect(() => {
		if (!store || store.accountId !== userId) {
			return
		}
		const focus = focusManager.subscribe((isFocused) => {
			if (isFocused) {
				void store.retryPending()
			} else {
				store.flush()
			}
		})
		const connection = onlineManager.subscribe((isOnline) => {
			if (isOnline) {
				void store.retryPending()
			}
		})
		return () => {
			focus()
			connection()
		}
	}, [store, userId])
	return null
}
