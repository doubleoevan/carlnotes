// the shared adapter interface every source kind implements: the seam the adapter-authoring skill defers to
import type { resources, sources } from "../../db/schema"

// a Source row is an adapter's input; a Resource insert is its output — both inferred from the domain schema
export type Source = typeof sources.$inferSelect
export type NewResource = typeof resources.$inferInsert

// one kind's adapter: given a Source, fetch and return the Resources it emitted plus the cost it incurred
export type SourceAdapter = (source: Source) => Promise<AdapterResult>

// adapters return Resources only (never Findings) plus the cost of producing them (0 when keyless);
// fallbackMode is set only when the adapter ran a keyless fallback path, so a degraded Scan stays traceable
export type AdapterResult = { resources: NewResource[]; cost: number; fallbackMode?: string }
