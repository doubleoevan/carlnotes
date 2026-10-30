// app version comparison and the rejection an installed build older than its platform's minimum gets
import { z } from "zod"

// the rejection an outdated build gets on every api path, with the minimum it has to reach and where to update
export const APP_VERSION_OUTDATED_REJECTION = "appVersionOutdated"

// what the blocking update notice says: the title, the body with and without the minimum the response named, and
// the two actions
export const APP_UPDATE_COPY = {
	title: "Carl needs a newer app",
	body: "Carl got a new espresso machine. This app uses the old one. Update to catch up.",
	update: "Update CarlNotes",
	checkAgain: "Check again",
} as const

// what Carl says when a request is rejected for the build's age
export const APP_VERSION_OUTDATED_LINE = `${APP_UPDATE_COPY.title} for that. Update CarlNotes from the store.`

/**
 * Returns the notice's body, naming the minimum version when the response had one.
 */
export function toAppUpdateBody(minimumVersion: string | null): string {
	return minimumVersion ? `${APP_UPDATE_COPY.body} Version ${minimumVersion} or newer does it.` : APP_UPDATE_COPY.body
}

// the response body of the outdated build rejection
export const appVersionOutdatedResponse = z.object({
	rejection: z.literal(APP_VERSION_OUTDATED_REJECTION),
	minimumVersion: z.string(),
	storeUrl: z.string(),
})

export type AppVersionOutdatedResponse = z.infer<typeof appVersionOutdatedResponse>

// a version is one to four dotted integers, as Expo writes `version` and the stores show it
const APP_VERSION_PATTERN = /^\d{1,6}(\.\d{1,6}){0,3}$/
export const appVersion = z.string().regex(APP_VERSION_PATTERN)

/**
 * Returns a version's integer segments, or null for a value that is not dotted integers.
 */
export function parseAppVersion(version: string | null | undefined): number[] | null {
	if (!version || !APP_VERSION_PATTERN.test(version)) {
		return null
	}
	return version.split(".").map(Number)
}

/**
 * Compares two parsed versions segment by segment, a missing segment counting as zero.
 */
export function compareAppVersions(left: number[], right: number[]): -1 | 0 | 1 {
	// walk the longer of the two, so 1.2 and 1.2.0 compare equal
	const segmentCount = Math.max(left.length, right.length)
	for (let i = 0; i < segmentCount; i++) {
		// the first differing segment decides
		const leftSegment = left[i] ?? 0
		const rightSegment = right[i] ?? 0
		if (leftSegment !== rightSegment) {
			return leftSegment < rightSegment ? -1 : 1
		}
	}
	return 0
}

export type IsAppVersionSupportedOptions = {
	installedVersion: string | null | undefined
	minimumVersion: string | null | undefined
}

/**
 * Returns false only when both versions parse and the app's is below the minimum. A missing or unparseable version on
 * either side is served, so the gate fails open.
 */
export function isAppVersionSupported({ installedVersion, minimumVersion }: IsAppVersionSupportedOptions): boolean {
	// serve when either side is unreadable
	const parsedAppVersion = parseAppVersion(installedVersion)
	const parsedMinimumVersion = parseAppVersion(minimumVersion)
	if (!parsedAppVersion || !parsedMinimumVersion) {
		return true
	}

	// an equal or newer build is supported
	return compareAppVersions(parsedAppVersion, parsedMinimumVersion) >= 0
}

/**
 * Returns true if a response body is the outdated-build rejection.
 */
export function isAppVersionOutdatedResponse(body: unknown): body is AppVersionOutdatedResponse {
	return appVersionOutdatedResponse.safeParse(body).success
}
