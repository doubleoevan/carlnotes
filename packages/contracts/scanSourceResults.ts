// a scan's source results: one result per Source as the scans table stores it, and the scan note a topic page
// loads per scan
import { z } from "zod"
import { SOURCE_RESULT_LABEL_CHARS } from "./sources"

// how long a failed source result's reason may be, and the most source results one scan note returns. two Source adds
// at once can pass the ten Source limit
export const SOURCE_RESULT_REASON_CHARS = 300
const MAX_SOURCE_RESULTS = 50

// the fields every stored source result has
const storedSourceResultFields = {
	sourceId: z.string(),
	sourceKind: z.string(),
	label: z.string(),
	foundCount: z.number().int().nonnegative(),
	keptCount: z.number().int().nonnegative(),
	costDollars: z.number().nonnegative(),
	durationMs: z.number().nonnegative(),
}

// one Source's result in a scan, as the scans table stores it
const storedSourceResult = z.discriminatedUnion("status", [
	z.object({ ...storedSourceResultFields, status: z.literal("ok") }),
	z.object({ ...storedSourceResultFields, status: z.literal("fallback"), fallbackMode: z.string() }),
	z.object({ ...storedSourceResultFields, status: z.literal("failed"), reason: z.string() }),
	z.object({ ...storedSourceResultFields, status: z.literal("skipped") }),
])

export type StoredSourceResult = z.infer<typeof storedSourceResult>

// a scan's source results as stored: one per Source, and the findings from earlier scans that no Source returned, read
// again and kept. results saved before the earlier read count read it as zero
export const storedScanSourceResults = z.object({
	sources: z.array(storedSourceResult),
	earlierKeptCount: z.number().int().nonnegative(),
	earlierFoundCount: z.number().int().nonnegative().default(0),
})

export type StoredScanSourceResults = z.infer<typeof storedScanSourceResults>

// the fields every source result in a scan note has: the stored fields, bounded, with a cost of null for everyone but the
// owner and admins
const sourceResultFields = {
	...storedSourceResultFields,
	label: z.string().max(SOURCE_RESULT_LABEL_CHARS),
	costDollars: z.number().nonnegative().nullable(),
}

// one Source's result in a scan note, which has no skipped status. a reason is null for everyone but the owner and
// admins
const sourceResult = z.discriminatedUnion("status", [
	z.object({ ...sourceResultFields, status: z.literal("ok") }),
	z.object({ ...sourceResultFields, status: z.literal("fallback"), fallbackMode: z.string() }),
	z.object({
		...sourceResultFields,
		status: z.literal("failed"),
		reason: z.string().max(SOURCE_RESULT_REASON_CHARS).nullable(),
	}),
])

export type SourceResult = z.infer<typeof sourceResult>

// a scan note's source results
export const scanSourceResults = z.object({
	sources: z.array(sourceResult).max(MAX_SOURCE_RESULTS),
	earlierKeptCount: z.number().int().nonnegative(),
	earlierFoundCount: z.number().int().nonnegative(),
})

export type ScanSourceResults = z.infer<typeof scanSourceResults>

// one scan's recap and source results, loaded per scan. malformed results parse to null
export const scanNote = z.object({
	scanSummary: z.string().nullable(),
	sourceResults: scanSourceResults.nullable().catch(null),
})

export type ScanNote = z.infer<typeof scanNote>

// the note a failed read returns, with no summary and no source results
export const EMPTY_SCAN_NOTE: ScanNote = { scanSummary: null, sourceResults: null }
