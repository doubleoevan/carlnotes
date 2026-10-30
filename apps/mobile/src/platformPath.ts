import { isSiteUrl, SITE_URL } from "@carlnotes/contracts/site"

/**
 * Maps implemented CarlNotes pages to platform routes, including bylines and canonical Topic slugs.
 */
export function toPlatformPath(href: string): string {
	const isRelative = href.startsWith("/") && !href.startsWith("//")
	if (!isRelative && !isSiteUrl(href)) {
		return href
	}
	const url = new URL(href, SITE_URL)
	// direct note links keep the owning page context in the app editor
	if (/^\/(topics|teams)\/[^/]+\/(?:notes\/[^/]+|chat)\/?$/.test(url.pathname)) {
		return `${url.pathname}${url.search}${url.hash}`
	}
	// match canonical and app episode paths before the generic Topic route
	const episode = url.pathname.match(/^\/topics\/([^/]+)(?:\/[^/]+)?\/episodes\/(\d+)\/(\d+)\/?$/)
	if (episode) {
		return `/topics/${episode[1]}/episodes/${episode[2]}/${episode[3]}${url.search}${url.hash}`
	}

	// a Topic with or without its slug
	const topic = url.pathname.match(/^\/topics\/([^/]+)(?:\/(?!notes(?:\/|$))[^/]+)?\/?$/)
	if (topic) {
		return `/topics/${topic[1]}${url.search}${url.hash}`
	}

	// the pages whose web path is their native path
	if (/^\/(?:account|plans|activity|teams|profiles)(?:\/|$)/.test(url.pathname)) {
		return `${url.pathname}${url.search}${url.hash}`
	}
	return href
}

// the native routes under app/, as path patterns, with the tab and session screens
const NATIVE_ROUTE_PATTERNS = [
	/^\/$/,
	/^\/(search|settings|account|activity|chat|plans|sign-in|sign-up|teams)$/,
	/^\/invite\/[^/]+$/,
	/^\/profiles\/[^/]+$/,
	/^\/teams\/[^/]+(\/chat|\/notes\/[^/]+)?$/,
	/^\/topics\/[^/]+(\/chat|\/notes\/[^/]+|\/episodes\/\d+\/\d+)?$/,
]

/**
 * Returns true if a path, with or without its query and hash, has a native route.
 */
export function hasNativeRoute(path: string): boolean {
	const pathname = (path.split(/[?#]/, 1)[0] ?? path).replace(/\/+$/, "") || "/"
	return NATIVE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
}
