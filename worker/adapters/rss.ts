// the RSS adapter: turns a keyless RSS/Atom Source into canonical, deduped Resources (kind "read")
import type { Source, SourceAdapter } from "./adapter"
import { fetchFeed } from "./feed"

// read the feed url from the Source config, fetch it, and parse it into Resources; keyless, so cost is 0
export const rssAdapter: SourceAdapter = async (source: Source) => {
	// the feed url lives in the Source config; a non-string means a misconfigured Source (isolated by runTopicScan)
	const feedUrl = source.config.url
	if (typeof feedUrl !== "string") {
		throw new Error(`rss source ${source.id} has no string config.url`)
	}
	// fetch and parse the keyless feed into read Resources
	return { resources: await fetchFeed(feedUrl), cost: 0 }
}
