// the avatar refresh signal
import { useSyncExternalStore } from "react"

// the version each avatar url includes, and the components watching it
let avatarVersion = 0
const versionListeners = new Set<() => void>()

/**
 * Tell every avatar on the page to re-fetch, after an upload arrives.
 */
export function refreshAvatars(): void {
	avatarVersion += 1
	for (const listener of versionListeners) {
		listener()
	}
}

/**
 * The current avatar version, which changes whenever an upload finishes.
 */
export function useAvatarVersion(): number {
	// the third read serves server-side renders
	return useSyncExternalStore(
		subscribeToVersion,
		() => avatarVersion,
		() => avatarVersion,
	)
}

// one subscription per mounted avatar, dropped when it unmounts
function subscribeToVersion(onVersionChange: () => void): () => void {
	versionListeners.add(onVersionChange)
	return () => versionListeners.delete(onVersionChange)
}
