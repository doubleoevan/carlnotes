// the adapter registry maps each source kind to its adapter. a new source kind adds one line here
import type { Source, SourceAdapter } from "./adapter"
import { redditAdapter } from "./reddit"
import { rssAdapter } from "./rss"
import { searchAdapter } from "./search"
import { youtubeAdapter } from "./youtube"

// rss, reddit, YouTube, and search are wired. composio and plugin have no adapters yet, so the record is Partial, and lookups can miss
export const sourceAdapters: Partial<Record<Source["kind"], SourceAdapter>> = {
	rss: rssAdapter,
	reddit: redditAdapter,
	youtube: youtubeAdapter,
	search: searchAdapter,
}
