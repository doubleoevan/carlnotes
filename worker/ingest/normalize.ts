// the url, title, and kind normalization a Resource gets before it is stored
import type { NewResource } from "./ingester"

// the query parameters that name a referrer instead of the page. filter them out of the url
const TRACKING_PARAMETERS = /^(utm_|fbclid$|gclid$|mc_[ce]id$|igshid$|si$|ref$|ref_src$|source$|spm$)/i

// paths are case-sensitive in general
const CASE_INSENSITIVE_PATH_HOSTS = ["reddit.com", "x.com"]

// a host renamed to another one, which serves the same page under both names
const RENAMED_HOSTS: Record<string, string> = { "twitter.com": "x.com", "mobile.twitter.com": "x.com" }

// a YouTube channel named by its handle, which ignores case, optionally followed by a tab like /videos
const YOUTUBE_HANDLE_PATH = /^\/(@[^/]+|c\/[^/]+|user\/[^/]+)(\/|$)/

// YouTube's older channel url, which is the handle alone with no @ or /c/ in front
const YOUTUBE_LEGACY_HANDLE_PATH = /^\/[^/@]+\/?$/

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
 * A url reduced to the one form every variant of it shares. A url that does not parse comes back untouched.
 */
export function toCanonicalUrl(url: string): string {
	let parsedUrl: URL
	try {
		parsedUrl = new URL(url.trim())
	} catch {
		return url
	}

	// the host never distinguishes case
	parsedUrl.hostname = parsedUrl.hostname.toLowerCase()

	// a renamed host folds to its current name, matched with and without the www prefix
	const renamedHost = RENAMED_HOSTS[parsedUrl.hostname] ?? RENAMED_HOSTS[parsedUrl.hostname.replace(/^www\./, "")]
	if (renamedHost) {
		parsedUrl.hostname = renamedHost
	}

	// a fragment addresses a place inside the page, not a different page
	parsedUrl.hash = ""

	// drop the parameters that name a referrer, then sort the rest so their order stops mattering
	for (const parameterName of [...parsedUrl.searchParams.keys()]) {
		if (TRACKING_PARAMETERS.test(parameterName)) {
			parsedUrl.searchParams.delete(parameterName)
		}
	}
	parsedUrl.searchParams.sort()

	// a few hosts ignore the case of their paths, so those fold to lowercase, and the rest stay as written
	const hostWithoutWww = parsedUrl.hostname.replace(/^www\./, "")
	const hasCaseInsensitivePath = CASE_INSENSITIVE_PATH_HOSTS.some(
		(knownHost) => hostWithoutWww === knownHost || hostWithoutWww.endsWith(`.${knownHost}`),
	)

	// YouTube folds case only on its handle forms
	const isYouTube = hostWithoutWww === "youtube.com" || hostWithoutWww.endsWith(".youtube.com")
	const isYouTubeHandle =
		isYouTube && (YOUTUBE_HANDLE_PATH.test(parsedUrl.pathname) || YOUTUBE_LEGACY_HANDLE_PATH.test(parsedUrl.pathname))

	// a trailing slash addresses the same page, though the root path keeps its single slash
	const path = hasCaseInsensitivePath || isYouTubeHandle ? parsedUrl.pathname.toLowerCase() : parsedUrl.pathname
	parsedUrl.pathname = path.length > 1 ? path.replace(/\/+$/, "") : path
	return parsedUrl.toString()
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
