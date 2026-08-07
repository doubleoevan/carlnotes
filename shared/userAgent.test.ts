// the session forms reorder on this detection and analytics reports it, so these are real user agent strings
// rather than invented ones. a token that changes in the wild is what would break both, and only this catches it

import { expect, test } from "bun:test"
import { isInAppBrowser, toBrowserPlatform, toPlatform } from "./userAgent"

// the in-app browsers that send us traffic, each as the app actually reports itself
const IN_APP_AGENTS = {
	linkedIn:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.2543",
	instagram:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.32.99",
	facebook:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) [FBAN/FBIOS;FBAV/468.0.0.35.108]",
	androidWebview:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.101 Mobile Safari/537.36",
}

// the ordinary browsers that must keep today's order
const BROWSER_AGENTS = {
	desktopChrome:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	mobileSafari:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
	androidChrome:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36",
}

test("every in-app browser we know about is detected", () => {
	for (const [app, userAgent] of Object.entries(IN_APP_AGENTS)) {
		expect(isInAppBrowser(userAgent), app).toBe(true)
	}
})

test("an ordinary browser is left alone", () => {
	// android chrome is the one worth naming: it carries Android without the wv that marks a webview
	for (const [browser, userAgent] of Object.entries(BROWSER_AGENTS)) {
		expect(isInAppBrowser(userAgent), browser).toBe(false)
	}
})

test("the platform tells android from ios, since only one has a way out", () => {
	expect(toBrowserPlatform(IN_APP_AGENTS.androidWebview)).toBe("android")
	expect(toBrowserPlatform(IN_APP_AGENTS.linkedIn)).toBe("ios")
	expect(toBrowserPlatform(BROWSER_AGENTS.desktopChrome)).toBe("other")
})

// a request with no user agent header still has to yield a value, since every browser event carries one
test("a missing user agent reads as desktop and not a webview", () => {
	expect(toPlatform(null)).toBe("desktop")
	expect(toPlatform(undefined)).toBe("desktop")
	expect(isInAppBrowser("")).toBe(false)
	expect(toBrowserPlatform("")).toBe("other")
})

test("the device platform splits mobile from desktop", () => {
	expect(toPlatform(BROWSER_AGENTS.mobileSafari)).toBe("mobile")
	expect(toPlatform(BROWSER_AGENTS.androidChrome)).toBe("mobile")
	expect(toPlatform(BROWSER_AGENTS.desktopChrome)).toBe("desktop")
})
