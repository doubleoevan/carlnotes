// the App Store smart banner meta the pages carry once the store record exists

import { APP_STORE_ID } from "@carlnotes/contracts/mobileApp"
import { SITE_URL } from "@carlnotes/contracts/site"

// the meta tag shape a route head takes
export type AppStoreBannerMeta = { name: string; content: string }

/**
 * Returns the smart banner meta for a page path, or none while the App Store id is unset.
 */
export function toAppStoreBannerMeta(pathname: string, appStoreId: string | null = APP_STORE_ID): AppStoreBannerMeta[] {
	if (!appStoreId) {
		return []
	}
	// Safari reads the content as comma-separated fields, so a comma or semicolon in the path is encoded
	const appArgument = `${SITE_URL}${pathname.replace(/[,;]/g, encodeURIComponent)}`
	return [{ name: "apple-itunes-app", content: `app-id=${appStoreId}, app-argument=${appArgument}` }]
}
