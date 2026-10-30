// the mobile app's identity. the app's config and the api's Apple provider and trusted origins both read this identity
import type { MobilePlatform } from "./clientTelemetry"

// the iOS bundle identifier and the Android package name
export const MOBILE_APP_BUNDLE_IDENTIFIER = "com.carlnotes.app"

// the url scheme the app opens on, and the origin Better Auth trusts for every url of that scheme
export const MOBILE_APP_SCHEME = "carlnotes"
export const MOBILE_APP_SCHEME_ORIGIN = `${MOBILE_APP_SCHEME}://`

// the App Store record's numeric id, null until the record exists
export const APP_STORE_ID: string | null = null

// the docs page that points a phone at the stores, and the store page a platform updates from
export const GET_THE_APP_PATH = "/docs/get-the-app"
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${MOBILE_APP_BUNDLE_IDENTIFIER}`

/**
 * Returns the page a platform's build updates from: the Play listing, the App Store record once its id is known, and
 * the docs "Get the app" page on the given site before that.
 */
export function toMobileStoreUrl(platform: MobilePlatform, siteUrl: string): string {
	if (platform === "android") {
		return PLAY_STORE_URL
	}
	return APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : `${siteUrl}${GET_THE_APP_PATH}`
}
