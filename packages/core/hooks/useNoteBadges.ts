import { fetchNoteBadges, sendNoteRead } from "@carlnotes/client/noteClient"
import { focusManager, onlineManager } from "@tanstack/react-query"
import { useEffect } from "react"
import {
	isNoteBadgeAccount,
	markNoteOpened,
	resetNoteBadges,
	setNoteBadges,
	settleNoteOpened,
	toNoteBadgeGeneration,
} from "../stores/noteBadgeStore"

export const NOTE_BADGE_POLL_MS = 45_000
let refreshVersion = 0

/**
 * Polls note counts independently of chat, using Query's browser or native foreground/connectivity adapters.
 */
export function useNoteBadges(userId: string | null | undefined): void {
	useEffect(() => {
		const generation = resetNoteBadges(userId ?? null)
		if (!userId) {
			return
		}
		let isPending = false
		const refresh = async (): Promise<void> => {
			if (
				isPending ||
				!isNoteBadgeAccount(userId, generation) ||
				!focusManager.isFocused() ||
				!onlineManager.isOnline()
			) {
				return
			}
			isPending = true
			try {
				await refreshNoteBadges(userId, generation)
			} finally {
				isPending = false
			}
		}
		void refresh()
		const timer = setInterval(() => void refresh(), NOTE_BADGE_POLL_MS)
		const stopFocus = focusManager.subscribe((isFocused) => {
			if (isFocused) {
				void refresh()
			}
		})
		const stopOnline = onlineManager.subscribe((isOnline) => {
			if (isOnline) {
				void refresh()
			}
		})
		return () => {
			clearInterval(timer)
			stopFocus()
			stopOnline()
			if (isNoteBadgeAccount(userId, generation)) {
				resetNoteBadges(null)
			}
		}
	}, [userId])
}

/**
 * Records only a successfully loaded note as read, rolling back any unacknowledged suppression.
 */
export function useNoteRead(noteId: string | null, userId: string | null | undefined): void {
	useEffect(() => {
		if (noteId && userId) {
			void recordNoteRead(noteId, userId)
		}
	}, [noteId, userId])
}

/**
 * Clears a note tentatively, then releases that suppression after the server responds and counts refresh.
 */
export async function recordNoteRead(noteId: string, userId: string): Promise<boolean> {
	const generation = toNoteBadgeGeneration()
	if (!isNoteBadgeAccount(userId, generation)) {
		return false
	}
	const token = markNoteOpened(noteId)
	try {
		const isAcknowledged = await sendNoteRead(noteId)
		if (isAcknowledged) {
			await refreshNoteBadges(userId, generation)
		}
		return isAcknowledged
	} finally {
		if (isNoteBadgeAccount(userId, generation)) {
			settleNoteOpened(noteId, token)
		}
	}
}

// failed refreshes retain the last confirmed counts instead of displaying an invented zero
async function refreshNoteBadges(userId: string, generation: number): Promise<void> {
	if (!isNoteBadgeAccount(userId, generation)) {
		return
	}
	try {
		const requestVersion = ++refreshVersion
		const badges = await fetchNoteBadges()
		if (isNoteBadgeAccount(userId, generation) && requestVersion === refreshVersion) {
			setNoteBadges(badges)
		}
	} catch {
		// the next foreground, reconnect or interval retries without clearing confirmed counts
	}
}
