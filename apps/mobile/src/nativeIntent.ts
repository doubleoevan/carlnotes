// what a link into the app opens: its native route, the sign-in screen for a visitor's link to an account screen,
// the app's form of the web's redirect to login with the page to return to, or the browser for a listed path with no
// native route

import { isSiteUrl, SITE_URL } from "@carlnotes/contracts/site"
import { hasNativeRoute, toPlatformPath } from "./platformPath"

// the route that opens a url in the browser sheet and returns Home
export const OPEN_WEB_PATH = "/open-web"

// the routes behind sign-in, and the chat routes after a Topic or a Team path
const SIGNED_IN_PATHS = new Set(["/account", "/activity", "/chat", "/plans/billing", "/settings", "/teams"])
const CHAT_PATH_PATTERN = /^\/(topics|teams)\/[^/]+\/chat$/

// a web link's scheme and host, and the app's own scheme, whose first segment is already the path's
const WEB_LINK_ORIGIN_PATTERN = /^https?:\/\/[^/]*/i
const APP_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/*/i

/**
 * Returns a link's path with its query: the path of a carlnotes:// or https:// link, or a path as given. A web url is
 * mapped the way the in-app links are, so a Topic's slug and an episode's path reach their native routes.
 */
export function toLinkedPathWithQuery(link: string): string {
	// map a web url to its native path
	if (isSiteUrl(link)) {
		const platformPath = toPlatformPath(link === SITE_URL ? "/" : link)
		if (platformPath.startsWith("/")) {
			return platformPath
		}
	}

	// strip the web origin or the app scheme to get the path
	const path = link.replace(WEB_LINK_ORIGIN_PATTERN, "").replace(APP_SCHEME_PATTERN, "/")
	return path.startsWith("/") ? path : `/${path}`
}

/**
 * Returns true for a path only a signed-in user can open.
 */
export function isSignedInPath(path: string): boolean {
	const pathname = path.split(/[?#]/)[0] ?? path
	return SIGNED_IN_PATHS.has(pathname) || CHAT_PATH_PATTERN.test(pathname)
}

/**
 * Returns what a link opens: a web url's native route, the browser for a listed web path with no native route, the
 * sign-in screen for a visitor's link to an account screen after remembering that screen as the place to return to,
 * and any other link as given, so Expo Router still recognizes the development client's own link.
 */
export function toLinkedPath({
	link,
	hasSession,
	rememberReturnPath,
}: {
	link: string
	hasSession: boolean
	rememberReturnPath: (path: string) => void
}): string {
	// a web url the app has no route for opens in the browser
	const isWebLink = isSiteUrl(link)
	const path = toLinkedPathWithQuery(link)
	if (isWebLink && !hasNativeRoute(path)) {
		return `${OPEN_WEB_PATH}?url=${encodeURIComponent(link)}`
	}

	// a user's link, and a visitor's link to a public page, open at their path
	if (hasSession || !isSignedInPath(path)) {
		return isWebLink ? path : link
	}

	// a visitor's link to an account screen opens sign-in, and the screen opens after it
	rememberReturnPath(path)
	return "/sign-in"
}
