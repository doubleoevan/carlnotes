// the line the Account screen ends with: the app version and native build, and the loaded update when there is one

export type AppVersionLabelOptions = {
	appVersion: string | null
	nativeBuildVersion: string | null
	updateId: string | null
}

// how much of an update id the line shows
const UPDATE_ID_LENGTH = 8

/**
 * Returns the version line, such as "CarlNotes 1.2.0 (34)" with " · update 1a2b3c4d" while an EAS Update is loaded,
 * or "CarlNotes development" when the build reports no version.
 */
export function toAppVersionLabel({ appVersion, nativeBuildVersion, updateId }: AppVersionLabelOptions): string {
	// a build with no version reads as development
	if (!appVersion) {
		return "CarlNotes development"
	}

	// the version with its build in parentheses
	const versionWithBuild = nativeBuildVersion ? `${appVersion} (${nativeBuildVersion})` : appVersion

	// the loaded update, named by the start of its id
	const updateText = updateId ? ` · update ${updateId.slice(0, UPDATE_ID_LENGTH)}` : ""
	return `CarlNotes ${versionWithBuild}${updateText}`
}
