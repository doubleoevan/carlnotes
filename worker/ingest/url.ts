// the url ingester. it names one page as a Source so a Topic can point at a specific article or doc,
// instead of a feed that keeps producing new ones

import { toFetchableUrl } from "../scrape"
import type { Source, SourceIngester } from "./ingester"

/**
 * Emits the Source's page as a single Resource. It costs nothing here because review fetches a Resource's
 * content when it admits one, so the page goes through the same fetch, storage, and reuse as any other.
 */
export const urlIngester: SourceIngester = async (source: Source) => {
	// the page url lives in the Source config. a non-string url is a misconfigured Source, and the Scan isolates the failure
	const pageUrl = source.config.url
	if (typeof pageUrl !== "string") {
		throw new Error(`url source ${source.id} has no string config.url`)
	}

	// reject a malformed, non-http, or privately routable url before it reaches the fetch
	const fetchableUrl = toFetchableUrl(pageUrl)

	// the title is left for the fetch to fill, since knowing it here would mean fetching the page twice
	return { resources: [{ url: fetchableUrl.toString(), kind: "read" }], cost: 0 }
}
