// the adapter registry: maps a source kind to its adapter; new kinds add one line here
import type { Source, SourceAdapter } from "./adapter"
import { rssAdapter } from "./rss"

// only rss is wired today; the other kinds stay absent until their adapters land (Partial, so lookups are optional)
export const sourceAdapters: Partial<Record<Source["kind"], SourceAdapter>> = { rss: rssAdapter }
