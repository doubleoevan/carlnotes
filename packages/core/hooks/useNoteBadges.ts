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

const NOTE_BADGE_POLL_MS = 45_000
let refreshVersion = 0

/**
 * Polls note counts independently of chat, using Query's browser or native foreground/connectivity adapters.
 */
export function useNoteBadges(userId: string | null | undefined): void {
	useEffect(() => {
		// reset the counts for this account, and stop if no user is signed in
		const generation = resetNoteBadges(userId ?? null)
		if (!userId) {
			return
		}
		// refresh the counts, one request at a time
		let isPending = false
		const refresh = async (): Promise<void> => {
			// skip if a refresh is running, the account changed, or the app is in the background or offline
			if (
				isPending ||
				!isNoteBadgeAccount(userId, generation) ||
				!focusManager.isFocused() ||
				!onlineManager.isOnline()
			) {
				return
			}
			// hold the pending flag until the request settles
			isPending = true
			try {
				await refreshNoteBadges(userId, generation)
			} finally {
				isPending = false
			}
		}
		// refresh now, on an interval, and when the app returns to the foreground
		void refresh()
		const timer = setInterval(() => void refresh(), NOTE_BADGE_POLL_MS)
		const stopFocus = focusManager.subscribe((isFocused) => {
			if (isFocused) {
				void refresh()
			}
		})
		// refresh when the network comes back
		const stopOnline = onlineManager.subscribe((isOnline) => {
			if (isOnline) {
				void refresh()
			}
		})
		// return a cleanup that stops the interval and both subscriptions
		return () => {
			clearInterval(timer)
			stopFocus()
			stopOnline()
			// clear the counts if this account and generation are still current
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
	// hide the note's badges, send the read, and refresh the counts if the server acknowledges it
	const token = markNoteOpened(noteId)
	try {
		const isAcknowledged = await sendNoteRead(noteId)
		if (isAcknowledged) {
			await refreshNoteBadges(userId, generation)
		}
		return isAcknowledged
	} finally {
		// release the hidden badges if this account and generation are still current
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
		// apply the counts only if the account is current and no newer refresh started
		const requestVersion = ++refreshVersion
		const badges = await fetchNoteBadges()
		if (isNoteBadgeAccount(userId, generation) && requestVersion === refreshVersion) {
			setNoteBadges(badges)
		}
	} catch {
		// the next foreground, reconnect or interval retries without clearing confirmed counts
	}
}
