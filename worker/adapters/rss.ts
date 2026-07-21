// the RSS adapter. it turns a RSS that doesn't require an API key or Atom Source into deduped "read" Resources
import type { Source, SourceAdapter } from "./adapter"
import { fetchFeed } from "./feed"

/**
 * Reads the feed url from the Source config, fetch it, and parse it into Resources. the fetch does not require an API key so the cost is 0
 */
export const rssAdapter: SourceAdapter = async (source: Source) => {
	// the feed url lives in the Source config. a non-string url is a misconfigured Source, and the Scan isolates the failure
	const feedUrl = source.config.url
	if (typeof feedUrl !== "string") {
		throw new Error(`rss source ${source.id} has no string config.url`)
	}

	// fetch and parse the feed into "read" Resources
	return { resources: await fetchFeed(feedUrl), cost: 0 }
}
