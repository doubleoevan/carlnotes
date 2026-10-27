import { SITE_URL } from "@carlnotes/core/lib/pageHead"

/**
 * Keeps implemented CarlNotes pages native, including bylines and canonical Topic slugs.
 */
export function toNativePath(href: string): string {
	const isRelative = href.startsWith("/") && !href.startsWith("//")
	if (!isRelative && !href.startsWith(`${SITE_URL}/`)) {
		return href
	}
	const url = new URL(href, SITE_URL)
	// direct note links keep the owning page context in the native editor
	if (/^\/(topics|teams)\/[^/]+\/(?:notes\/[^/]+|chat)\/?$/.test(url.pathname)) {
		return `${url.pathname}${url.search}${url.hash}`
	}
	const topic = url.pathname.match(/^\/topics\/([^/]+)(?:\/(?!notes(?:\/|$))[^/]+)?\/?$/)
	if (topic) {
		return `/topics/${topic[1]}${url.search}${url.hash}`
	}
	if (/^\/(?:account|plans|activity|teams|profiles)(?:\/|$)/.test(url.pathname)) {
		return `${url.pathname}${url.search}${url.hash}`
	}
	return href
}
