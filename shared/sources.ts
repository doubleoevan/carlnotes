// how a Source's stored config reads as one line. the topic page, the feed, and topic chat all show the same summary

/**
 * The one-line display summary of a source's config: feed host, subreddit, or channel/playlist id.
 */
export function toSourceSummary(sourceKind: string, config: Record<string, unknown>): string {
	// each source kind names its config differently. an unknown kind or a missing value falls back to an empty summary
	const { url, subreddit, channelId, playlistId } = config
	if (sourceKind === "rss" && typeof url === "string") {
		return toUrlHost(url) ?? url
	}

	// a url source uses the full path
	if (sourceKind === "url" && typeof url === "string") {
		return url
	}

	// a search source is the built-in web search. its ingester ignores the config, so the caller supplies the copy
	if (sourceKind === "search") {
		return ""
	}
	if (sourceKind === "reddit" && typeof subreddit === "string") {
		return `r/${subreddit}`
	}

	// a YouTube source includes either a channel id or a playlist id
	if (sourceKind === "youtube") {
		const youtubeId = [channelId, playlistId].find((id) => typeof id === "string")
		return typeof youtubeId === "string" ? youtubeId : ""
	}
	return ""
}

/**
 * Return the host for the url or null if the url is invalid.
 */
export function toUrlHost(url: string): string | null {
	try {
		return new URL(url).host
	} catch {
		return null
	}
}
