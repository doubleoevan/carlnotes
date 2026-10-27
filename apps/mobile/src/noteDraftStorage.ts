import { authClient } from "@carlnotes/client/authClient"
import { toEventListeners } from "@carlnotes/core/stores/storeListeners"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { onlineManager } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import type { NoteDraftSnapshot } from "./stores/noteDraftStore"
import { type NoteDraftStore, toNoteDraftStore } from "./stores/noteDraftStore"

// the active draft store belongs to one account
let activeStore: NoteDraftStore | null = null
let requestedAccountId: string | null = null
let activation: Promise<void> = Promise.resolve()
let isSessionExiting = false
const { subscribe, announce } = toEventListeners<void>()
const getStore = (): NoteDraftStore | null => activeStore
const EMPTY_SNAPSHOT: NoteDraftSnapshot = { notes: [], hasStorageError: false, unavailableIds: new Set() }
const emptySubscribe = (): (() => void) => () => {}
const getEmptySnapshot = (): NoteDraftSnapshot => EMPTY_SNAPSHOT

/**
 * Reads the current account's local draft entries without borrowing the previous account's snapshot.
 */
export function useNoteDraftSnapshot(store: NoteDraftStore | null): NoteDraftSnapshot {
	return useSyncExternalStore(
		store?.subscribe ?? emptySubscribe,
		store?.getSnapshot ?? getEmptySnapshot,
		store?.getSnapshot ?? getEmptySnapshot,
	)
}

/**
 * Restores the current account's drafts after retiring and draining a replaced account.
 */
export function activateNoteDraftAccount(accountId: string | null): Promise<void> {
	// queue the requested account after the previous activation settles
	requestedAccountId = accountId
	activation = activation
		.then(async () => {
			if (activeStore?.accountId === requestedAccountId) {
				return
			}

			// detach the previous account before draining its draft store
			const oldStore = activeStore
			activeStore = null
			announce()
			// preserve account activation when retired draft cleanup fails
			await oldStore?.retire().catch((error: unknown) => {
				console.error("note draft cleanup failed", error)
			})
			if (!requestedAccountId) {
				return
			}

			// recheck the live auth atom before every dispatch, including debounce and reconnect requests
			const ownerId = requestedAccountId
			isSessionExiting = false
			const store = toNoteDraftStore({
				accountId: ownerId,
				storage: AsyncStorage,
				canDispatch: () =>
					!isSessionExiting && activeStore === store && currentAccountId() === ownerId && onlineManager.isOnline(),
			})
			await store.restore()

			// discard a restored store if a newer account replaced its request
			if (requestedAccountId !== ownerId) {
				await store.retire()
				return
			}

			// publish the restored account and retry its pending saves
			activeStore = store
			announce()
			void store.retryPending()
		})
		.catch((error) => {
			console.error("note draft account transition failed", error)
		})
	return activation
}

/**
 * Returns the account-owned registry, without tying its lifetime to this component.
 */
export function useNoteDraftStore(): NoteDraftStore | null {
	return useSyncExternalStore(subscribe, getStore, getStore)
}

/**
 * Captures the exiting account and resumes its drafts after a failed sign-out.
 */
export function toNoteDraftExit(): (isAccepted: boolean) => Promise<void> {
	const store = activeStore
	isSessionExiting = true
	return async (isAccepted) => {
		if (!isAccepted) {
			isSessionExiting = false
			void store?.retryPending()
			return
		}
		if (activeStore === store) {
			activeStore = null
			announce()
		}
		await store?.retire()
	}
}

// read the same auth atom the native request's cookie belongs to
function currentAccountId(): string | null {
	const state = authClient().$store.atoms.session?.get() as { data?: { user: { id: string } } | null } | undefined
	return state?.data?.user.id ?? null
}
