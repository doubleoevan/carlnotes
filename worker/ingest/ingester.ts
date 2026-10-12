// schema tables the ingester types are inferred from
import type { resources } from "../../db/schema/scans"
import type { sources } from "../../db/schema/topics"

// a Source row is an ingester's input, and Resource inserts are its output
export type Source = typeof sources.$inferSelect
export type NewResource = typeof resources.$inferInsert

// a page body an ingester fetched, with the validators a later conditional GET is built from
export type FetchedBody = { markdown: string; etag: string | null; lastModified: string | null }

// a Resource an ingester finds, optionally including a body it fetched
export type IngestedResource = NewResource & { fetchedBody?: FetchedBody }

// a Resource that a Scan found, and whether a custom Source found it
export type DiscoveredResource = NewResource & { isFromCustomSource: boolean }

// what the Scan gives an ingester beside the Source. the Scan owner's LiteLLM key bills an ingester's model calls
export type IngestContext = { litellmApiKey?: string }

// the ingester for one source kind. it takes a Source and the Scan's ingest context.
// it returns the Resources it fetched plus the cost it incurred
export type SourceIngester = (source: Source, ingestContext?: IngestContext) => Promise<IngestResult>

// ingesters return Resources and the cost spent or 0 for fetches that don't use an API key
export type IngestResult = { resources: IngestedResource[]; costDollars: number; fallbackMode?: string }
