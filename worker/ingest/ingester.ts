// schema tables the ingester types are inferred from
import type { resources, sources } from "../../db/schema"

// a Source row is an ingester's input, and Resource inserts are its output. both types are inferred from the database schema
export type Source = typeof sources.$inferSelect
export type NewResource = typeof resources.$inferInsert

// a page body an ingester fetched, with the validators a later conditional GET is built from
export type FetchedBody = { markdown: string; etag: string | null; lastModified: string | null }

// a Resource an ingester finds, optionally including a body it fetched. the body is stored after the insert
// and never reaches the resources row as a column, so the review reuses it instead of paying to scrape again
export type IngestedResource = NewResource & { fetchedBody?: FetchedBody }

// the ingester for one source kind. it takes a Source and returns the Resources it fetched plus the cost it incurred
export type SourceIngester = (source: Source) => Promise<IngestResult>

// ingesters return Resources and the cost spent or 0 for fetches that don't use an API key.
// fallbackMode is only set when the ingester fell back to a free or keyless path, so the Scan can record it
export type IngestResult = { resources: IngestedResource[]; costDollars: number; fallbackMode?: string }
