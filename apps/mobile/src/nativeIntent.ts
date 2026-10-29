// what a link into the app opens: its own path, or the sign-in screen for a visitor's link to an account screen, the
// app's form of the web's redirect to login with the page to return to

// the routes behind sign-in, and the chat routes after a Topic or a Team path
const SIGNED_IN_PATHS = new Set(["/account", "/activity", "/chat", "/plans/billing", "/settings", "/teams"])
const CHAT_PATH_PATTERN = /^\/(topics|teams)\/[^/]+\/chat$/

// a web link's scheme and host, and the app's own scheme, whose first segment is already the path's
const WEB_LINK_ORIGIN_PATTERN = /^https?:\/\/[^/]*/i
const APP_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/*/i

/**
 * Returns a link's path with its query: the path of a carlnotes:// or https:// link, or a path as given.
 */
export function toLinkedPathWithQuery(link: string): string {
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
 * Returns what a link opens: the link as given, or the sign-in screen for a visitor's link to an account screen,
 * after remembering that screen as the place to return to. A link left as given keeps its scheme and host, so Expo
 * Router still recognizes the development client's own link.
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
	// a user's link, and a visitor's link to a public page, open as given
	const path = toLinkedPathWithQuery(link)
	if (hasSession || !isSignedInPath(path)) {
		return link
	}

	// a visitor's link to an account screen opens sign-in, and the screen opens after it
	rememberReturnPath(path)
	return "/sign-in"
}
