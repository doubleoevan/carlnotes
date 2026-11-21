// the rules of the edge cache check: which paths the origin marks shared, found from the live sitemap, and which
// cf-cache-status values mean Cloudflare never stores a response

// the shared paths that need no id: the pages, the documents, and the api reads every visitor shares
export const FIXED_SHARED_PATHS = [
	"/",
	"/plans",
	"/blog",
	"/docs/",
	"/releases",
	"/sitemap.xml",
	"/llms.txt",
	"/robots.txt",
	"/api/topic-feed",
	"/api/home",
]

// the cf-cache-status values of a response the edge did not store, and never will under its current rules
const UNCACHED_STATUSES = new Set(["DYNAMIC", "BYPASS"])

// the session cookie name a signed-in browser sends over https, with a value no session has
export const MADE_UP_SESSION_COOKIE = "__Secure-better-auth.session_token=edge-check-made-up"

// the first of each kind of public page the sitemap lists, by the parts of its path
type SitemapPages = {
	topic: { topicId: string; topicPath: string } | null
	podcastEpisode: { topicId: string; podcastEpisodePath: string; season: string; episodeNumber: string } | null
	topicPost: { topicPostId: string; topicPostPath: string } | null
	team: { teamId: string; teamPath: string } | null
}

/**
 * Returns the first public Topic, podcast episode, Topic Post, and team page that the sitemap's xml lists.
 */
export function toSitemapPages(sitemapXml: string): SitemapPages {
	// every listed path, without the origin
	const sitemapPaths = [...sitemapXml.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/g)].map(
		(match) => match[1] ?? "",
	)

	// the first path of each kind, matched by its shape
	const topicMatch = firstMatch(sitemapPaths, /^\/topics\/([^/]+)(\/[^/]+)?$/)
	const podcastEpisodeMatch = firstMatch(sitemapPaths, /^\/topics\/([^/]+)\/[^/]+\/episodes\/(\d+)\/(\d+)$/)
	const topicPostMatch = firstMatch(sitemapPaths, /^\/topics\/[^/]+\/[^/]+\/posts\/([^/]+)(\/[^/]+)?$/)
	const teamMatch = firstMatch(sitemapPaths, /^\/teams\/([^/]+)$/)
	return {
		topic: topicMatch ? { topicId: topicMatch[1] ?? "", topicPath: topicMatch[0] } : null,
		podcastEpisode: podcastEpisodeMatch
			? {
					topicId: podcastEpisodeMatch[1] ?? "",
					podcastEpisodePath: podcastEpisodeMatch[0],
					season: podcastEpisodeMatch[2] ?? "",
					episodeNumber: podcastEpisodeMatch[3] ?? "",
				}
			: null,
		topicPost: topicPostMatch ? { topicPostId: topicPostMatch[1] ?? "", topicPostPath: topicPostMatch[0] } : null,
		team: teamMatch ? { teamId: teamMatch[1] ?? "", teamPath: teamMatch[0] } : null,
	}
}

// the first path that matches the pattern, with its groups
function firstMatch(paths: string[], pattern: RegExp): RegExpMatchArray | null {
	return paths.map((path) => path.match(pattern)).find((match) => match !== null) ?? null
}

/**
 * Returns every shared path to check: the fixed ones, then each listed page with its page read and its documents.
 */
export function toSharedPaths(sitemapPages: SitemapPages): string[] {
	// a Topic's page, its page read, and its feed
	const { topic, podcastEpisode, topicPost, team } = sitemapPages
	const topicPaths = topic
		? [topic.topicPath, `/api/topics/${topic.topicId}/page`, `/topics/${topic.topicId}/feed.xml`]
		: []

	// a podcast episode's page and its page read
	const podcastEpisodePaths = podcastEpisode
		? [
				podcastEpisode.podcastEpisodePath,
				`/api/topics/${podcastEpisode.topicId}/episodes/${podcastEpisode.season}/${podcastEpisode.episodeNumber}/page`,
			]
		: []

	// a Topic Post's page and its page read, and a team's page, its page read, and its Dashboard's page read
	const topicPostPaths = topicPost ? [topicPost.topicPostPath, `/api/topic-posts/${topicPost.topicPostId}/page`] : []
	const teamPaths = team
		? [team.teamPath, `/api/teams/${team.teamId}/page`, `/api/dashboards/teamDashboard/${team.teamId}/page`]
		: []

	// the public Topic's Scan status, read without credentials
	const statusPaths = topic ? [`/api/status/topics/${topic.topicId}/scan`] : []
	return [...FIXED_SHARED_PATHS, ...topicPaths, ...podcastEpisodePaths, ...topicPostPaths, ...teamPaths, ...statusPaths]
}

/**
 * Returns the shared paths of a public Topic's owner, whom the sitemap does not list: their profile's page read and
 * their Dashboard's page read.
 */
export function toOwnerSharedPaths(ownerUserId: string): string[] {
	return [`/api/profiles/${ownerUserId}/page`, `/api/dashboards/topicDashboard/${ownerUserId}/page`]
}

/**
 * Returns why a second response was not served from the edge, or null if it was or may be on a later request. A check
 * that requires a hit fails on any other status.
 */
export function toEdgeCacheFailure({
	status,
	cacheStatus,
	isHitRequired = false,
}: {
	status: number
	cacheStatus: string | null
	isHitRequired?: boolean
}): string | null {
	// a failed response, and a response that did not pass through Cloudflare, are failures of their own
	if (status >= 400) {
		return `status ${status}`
	}
	if (!cacheStatus) {
		return "no cf-cache-status header"
	}

	// DYNAMIC and BYPASS mean the edge never stores the response, and a required hit takes HIT alone
	const upperCacheStatus = cacheStatus.toUpperCase()
	if (isHitRequired) {
		return upperCacheStatus === "HIT" ? null : upperCacheStatus
	}
	return UNCACHED_STATUSES.has(upperCacheStatus) ? upperCacheStatus : null
}
