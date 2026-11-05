// canonical public page addresses shared by receipt and ingestion
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
