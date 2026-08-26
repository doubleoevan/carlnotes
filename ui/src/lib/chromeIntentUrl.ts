// the way out of an embedded webview. what kind of browser the page is running in is read from @shared/userAgent

/**
 * The current page as an Android intent url that opens it in Chrome,
 * with a browser fallback for a device that does not have Chrome.
 * Android only: no other platform supports this kind of intent.
 */
export function toChromeIntentUrl(pageUrl: string): string {
	// the scheme is named at the intent's own end, so the url it wraps goes in without one
	const [scheme = "https", schemelessUrl = ""] = pageUrl.split("://")
	return `intent://${schemelessUrl}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`
}
