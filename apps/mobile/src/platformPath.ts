import { SITE_URL } from "@carlnotes/core/lib/pageHead"

/**
 * Maps implemented CarlNotes pages to platform routes, including bylines and canonical Topic slugs.
 */
export function toPlatformPath(href: string): string {
	const isRelative = href.startsWith("/") && !href.startsWith("//")
	if (!isRelative && !href.startsWith(`${SITE_URL}/`)) {
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
	const topic = url.pathname.match(/^\/topics\/([^/]+)(?:\/(?!notes(?:\/|$))[^/]+)?\/?$/)
	if (topic) {
		return `/topics/${topic[1]}${url.search}${url.hash}`
	}
	if (/^\/(?:account|plans|activity|teams|profiles)(?:\/|$)/.test(url.pathname)) {
		return `${url.pathname}${url.search}${url.hash}`
	}
	return href
}
