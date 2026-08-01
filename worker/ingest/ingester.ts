// schema tables the ingester types are inferred from
import type { resources, sources } from "../../db/schema"

// a Source row is an ingester's input, and Resource inserts are its output. both types are inferred from the database schema
export type Source = typeof sources.$inferSelect
export type NewResource = typeof resources.$inferInsert

// the ingester for one source kind. it takes a Source and returns the Resources it fetched plus the cost it incurred
export type SourceIngester = (source: Source) => Promise<IngestResult>

// ingesters return Resources and the cost spent or 0 for fetches that don't use an API key.
// fallbackMode is only set when the ingester fell back to a free or keyless path, so the Scan can record it
export type IngestResult = { resources: NewResource[]; cost: number; fallbackMode?: string }
