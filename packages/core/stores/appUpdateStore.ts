// whether the app is waiting on a store update. a 426 from any transport opens the blocking notice
import type { AppVersionOutdatedResponse } from "@carlnotes/contracts/appVersions"
import { toStoreListeners } from "./storeListeners"

// what the notice knows: the minimum the build has to reach, when the response said
export type AppUpdateRequirement = { minimumVersion: string | null }

// the open requirement, if any
let appUpdateRequirement: AppUpdateRequirement | null = null
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Records a 426, opening the notice once however many transports report it. A later body with a minimum fills in a
 * notice opened without one.
 */
export function markAppVersionOutdated(rejection: AppVersionOutdatedResponse | null): void {
	// keep an open notice unless the new report names a minimum the open one lacks
	const minimumVersion = rejection?.minimumVersion ?? null
	if (appUpdateRequirement && (appUpdateRequirement.minimumVersion || !minimumVersion)) {
		return
	}
	appUpdateRequirement = { minimumVersion }
	publish()
}

/**
 * Clears the requirement.
 */
export function clearAppUpdateRequirement(): void {
	if (!appUpdateRequirement) {
		return
	}
	appUpdateRequirement = null
	publish()
}

/**
 * Returns the open requirement, or null while the build is served.
 */
export function readAppUpdateRequirement(): AppUpdateRequirement | null {
	return appUpdateRequirement
}

/**
 * Returns the open requirement and re-renders the caller when it opens or clears.
 */
export function useAppUpdateRequirement(): AppUpdateRequirement | null {
	useStoreVersion()
	return appUpdateRequirement
}
