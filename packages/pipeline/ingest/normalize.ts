// the url, title, and kind normalization a Resource gets before it is stored
export { toCanonicalUrl } from "@carlnotes/contracts/canonicalUrl"

import type { NewResource } from "./ingester"

// what a line has to measure to pass as a title
const MIN_TITLE_CHARS = 3
const MAX_TITLE_CHARS = 120

// one snippet line reduced to the text, a title would be
function toTitleLine(line: string): string {
	return line
		.trim()
		.replace(/^#{1,6}\s*/, "")
		.replace(/^>\s*/, "")
		.replace(/^[-*+]\s+/, "")
		.trim()
}

// whether a cleaned line reads like a page's name instead of a piece of its body
function isTitleLine(line: string): boolean {
	// the length bounds first, then the shape
	if (line.length < MIN_TITLE_CHARS || line.length > MAX_TITLE_CHARS) {
		return false
	}
	return /^[\p{Lu}\p{N}]/u.test(line) && /\p{L}/u.test(line)
}

/**
 * A readable title for a Resource that arrived without one, extracted from its snippet or its url.
 * Search providers sometimes return an empty title, and a row printing only its host reads as broken.
 */
export function toFallbackTitle(url: string, snippet: string | null | undefined): string | null {
	// the first snippet line that reads like a title
	const titleLine = (snippet ?? "").split("\n").map(toTitleLine).find(isTitleLine)
	if (titleLine) {
		return titleLine
	}

	// otherwise read the last path segment, which names the page in most urls
	try {
		const parsedUrl = new URL(url)
		const lastPathSegment = parsedUrl.pathname.split("/").filter(Boolean).at(-1)
		if (!lastPathSegment) {
			return null
		}
		// turn the slug into words. separators become spaces and any trailing file extension goes
		const titleFromSegment = decodeURIComponent(lastPathSegment)
			.replace(/\.[a-z0-9]{1,5}$/i, "")
			.replace(/[-_+]+/g, " ")
			.trim()
		// a segment of pure punctuation leaves nothing to name the page with
		return titleFromSegment.length > 0 ? titleFromSegment.slice(0, MAX_TITLE_CHARS) : null
	} catch {
		return null
	}
}

/**
 * Whether a Resource's stored title is the one the fallback rule reads from its url alone, compared without case
 * so an anchor word matches the path it points at.
 */
export function isTitleFromUrlFallback(title: string | null, url: string): boolean {
	return title?.toLowerCase() === toFallbackTitle(url, null)?.toLowerCase()
}

// so the resource kind is inferred from the host
const WATCH_HOSTS = [
	"youtube.com",
	"youtu.be",
	"vimeo.com",
	"loom.com",
	"ted.com",
	"dailymotion.com",
	"dai.ly",
	"tiktok.com",
	"snapchat.com",
	"giphy.com",
	"rumble.com",
]
const LISTEN_HOSTS = ["podcasts.apple.com", "open.spotify.com", "overcast.fm", "pocketcasts.com", "soundcloud.com"]

/**
 * The kind of Resource a url points at, determined by its host. Anything unrecognized is returned as "read"
 */
export function toResourceKind(url: string): NewResource["kind"] {
	// an unparseable url has no host to match, so it falls back to the default kind
	let host: string
	try {
		host = new URL(url).hostname.replace(/^www\./, "").toLowerCase()
	} catch {
		return "read"
	}

	// return the resource kind based on the host
	if (isHostIn(host, WATCH_HOSTS)) {
		return "watch"
	}
	return isHostIn(host, LISTEN_HOSTS) ? "listen" : "read"
}

// whether a host matches one of the listed hosts, or is a subdomain of one, so m.youtube.com counts as youtube
function isHostIn(host: string, hosts: string[]): boolean {
	return hosts.some((knownHost) => host === knownHost || host.endsWith(`.${knownHost}`))
}
