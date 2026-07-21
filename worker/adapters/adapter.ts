// schema tables the adapter types are inferred from
import type { resources, sources } from "../../db/schema"

// a Source row is an adapter's input, and Resource inserts are its output. both types are inferred from the database schema
export type Source = typeof sources.$inferSelect
export type NewResource = typeof resources.$inferInsert

// the adapter for one source kind. it takes a Source and returns the Resources it fetched plus the cost it incurred
export type SourceAdapter = (source: Source) => Promise<AdapterResult>

// adapters return Resources and the cost spent or 0 for fetches that don't use an API key.
// fallbackMode is only set when the adapter fell back to a missing API key or free path so the Scan can record the degradation
export type AdapterResult = { resources: NewResource[]; cost: number; fallbackMode?: string }
