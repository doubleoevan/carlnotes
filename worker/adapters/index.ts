// the adapter registry: maps a source kind to its adapter; new kinds add one line here
import type { Source, SourceAdapter } from "./adapter"
import { redditAdapter } from "./reddit"
import { rssAdapter } from "./rss"
import { youtubeAdapter } from "./youtube"

// rss/reddit/youtube are wired; search/composio/plugin stay absent until their adapters land (Partial → optional lookups)
export const sourceAdapters: Partial<Record<Source["kind"], SourceAdapter>> = {
	rss: rssAdapter,
	reddit: redditAdapter,
	youtube: youtubeAdapter,
}
