// the way out of an embedded webview

/**
 * The current page as an Android intent url that opens it in Chrome,
 * with a browser fallback for a device that does not have Chrome.
 * Android only: no other platform supports this kind of intent.
 */
export function toChromeIntentUrl(pageUrl: string): string {
	// the scheme is named at the intent's own end, so the url it wraps goes in without one. the intent path stops before
	// the page url's fragment, whose # would start the intent's own fields. the fallback url keeps the whole page url
	const [scheme = "https", schemelessUrl = ""] = pageUrl.split("://")
	const [intentPath = ""] = schemelessUrl.split("#")
	return `intent://${intentPath}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`
}
