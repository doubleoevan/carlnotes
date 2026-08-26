// what a user agent says about the browser it came from. the ui reads its own, the api reads the request header

// the tokens the apps that send us traffic put in their user agent
const IN_APP_BROWSER_TOKENS = ["LinkedInApp", "Instagram", "FBAN", "FBAV", "; wv)"]

// an iPad running iPadOS reports itself as a Mac, so it counts as desktop here, the same way it renders
const MOBILE_USER_AGENT_PATTERN = /Mobi|Android|iPhone|iPod|IEMobile/i

// the platform decides the way out of a webview, so it is read apart from which app is hosting one
export type BrowserPlatform = "android" | "ios" | "other"

/**
 * Whether the user agent belongs to an app's embedded browser instead of a browser of its own.
 * This is a guess: it can be spoofed and it misses a webview we have no token for.
 */
export function isInAppBrowser(userAgent: string): boolean {
	return IN_APP_BROWSER_TOKENS.some((token) => userAgent.includes(token))
}

/**
 * The platform the user agent belongs to, which determines what we show for login in an embedded browser.
 * Android can be handed an intent url. iOS has no equivalent. Anything else needs neither.
 */
export function toBrowserPlatform(userAgent: string): BrowserPlatform {
	if (userAgent.includes("Android")) {
		return "android"
	}

	// iPadOS reports as a Mac with touch, so the touch check is what tells it from a desktop Safari
	const isIosDevice = /iPhone|iPad|iPod/.test(userAgent)
	return isIosDevice ? "ios" : "other"
}

/**
 * Which kind of device a request came from. Only meaningful for events that a browser triggered.
 */
export function toPlatform(userAgent: string | null | undefined): "mobile" | "desktop" {
	return userAgent && MOBILE_USER_AGENT_PATTERN.test(userAgent) ? "mobile" : "desktop"
}
