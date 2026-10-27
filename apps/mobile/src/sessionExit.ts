import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import { toNoteDraftExit } from "./noteDraftStorage"
import { clearQueryCache, toQueryCacheCleanup } from "./queryCache"

// retired sessions cannot reopen the authenticated tree after a failed sign-out request
const retiredSessionIds = new Set<string>()
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Retires a revoked or deleted account's session before clearing its reading data.
 */
export async function retireSession(sessionId: string): Promise<void> {
	// hide the authenticated tree before awaiting storage or network work
	retiredSessionIds.add(sessionId)
	publish()
	await toNoteDraftExit()(true)
	await clearQueryCache()
}

/**
 * Reports whether the session may still display authenticated content.
 */
export function useIsSessionRetired(sessionId: string | undefined): boolean {
	useStoreVersion()
	return sessionId !== undefined && retiredSessionIds.has(sessionId)
}

/**
 * Signs out, clearing reading data only after a successful session exit.
 */
export async function exitSession(
	signOut: () => Promise<{ error: { message?: string } | null }>,
): Promise<{ error: { message?: string } | null }> {
	// a rejected sign-out leaves the current cache usable
	const clear = toQueryCacheCleanup()
	const finishDraftExit = toNoteDraftExit()
	try {
		const signOutResult = await signOut()
		await finishDraftExit(!signOutResult.error)
		if (!signOutResult.error) {
			await clear()
		}
		return signOutResult
	} catch (error) {
		await finishDraftExit(false)
		throw error
	}
}
