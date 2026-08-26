// schema tables the ingester types are inferred from
import type { resources, sources } from "../../db/schema"

// a Source row is an ingester's input, and Resource inserts are its output
export type Source = typeof sources.$inferSelect
export type NewResource = typeof resources.$inferInsert

// a page body an ingester fetched, with the validators a later conditional GET is built from
export type FetchedBody = { markdown: string; etag: string | null; lastModified: string | null }

// a Resource an ingester finds, optionally including a body it fetched
export type IngestedResource = NewResource & { fetchedBody?: FetchedBody }

// the ingester for one source kind. it takes a Source and returns the Resources it fetched plus the cost it incurred
export type SourceIngester = (source: Source) => Promise<IngestResult>

// ingesters return Resources and the cost spent or 0 for fetches that don't use an API key
export type IngestResult = { resources: IngestedResource[]; costDollars: number; fallbackMode?: string }
