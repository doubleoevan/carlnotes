// scan orchestration: run a topic's Sources through their adapters, upsert deduped Resources, record the Scan
import { eq } from "drizzle-orm"
import { db } from "../db"
import { resources, scans, sources } from "../db/schema"
import { sourceAdapters } from "./adapters"
import type { AdapterResult, NewResource, Source } from "./adapters/adapter"
import { curateScan } from "./curation"

// what one Source produced: emitted Resources (with its id, for tracing), an isolated failure, or a skip
type SourceOutcome = ({ status: "ok"; sourceId: string } & AdapterResult) | { status: "failed" } | { status: "skipped" }

// a persisted Scan row, its per-Source fallback trace, and the summary toScanSummary computes for it
type Scan = typeof scans.$inferSelect
type DegradedSource = Scan["degradedSources"][number]
// the summary shape toScanSummary returns for runTopicScan to persist
type ScanSummary = {
	resources: NewResource[]
	foundCount: number
	cost: number
	status: Scan["status"]
	degradedSources: DegradedSource[]
}

// create a Scan, ingest every Source (failures isolated), then write found_count, cost, and status
export async function runTopicScan(topicId: string): Promise<Scan | undefined> {
	// open the Scan as "running" so an interrupted ingestion is visible as an unfinished row
	const [scan] = await db.insert(scans).values({ topicId }).returning()
	if (!scan) {
		throw new Error(`could not create scan for topic ${topicId}`)
	}
	// an infra failure after this point must finalize the Scan as failed, never leave it stuck "running"
	try {
		// run every Source through its adapter with per-Source failures isolated, then tally the outcomes
		const topicSources = await db.select().from(sources).where(eq(sources.topicId, topicId))
		const summary = toScanSummary(await Promise.all(topicSources.map(ingestSource)))

		// upsert the deduped Resources, skipping urls already stored so existing rows and embeddings stay intact
		if (summary.resources.length > 0) {
			await db.insert(resources).values(summary.resources).onConflictDoNothing({ target: resources.url })
		}
		// curate the discovered Resources into Findings (dedupe → filter → fetch → score), then close the Scan once
		const curation = await curateScan(scan, summary.resources)
		const { foundCount, cost, status, degradedSources } = summary
		const [finished] = await db
			.update(scans)
			.set({
				// ingestion outcomes
				status,
				foundCount,
				degradedSources,
				// curation outcomes, folded into the same Scan close
				keptCount: curation.keptCount,
				filteredCount: curation.filteredCount,
				stageCosts: curation.stageCosts,
				aiSummary: curation.aiSummary,
				// totals: ingestion cost plus every curation stage cost
				cost: (cost + curation.cost).toString(),
				finishedAt: new Date(),
			})
			.where(eq(scans.id, scan.id))
			.returning()
		return finished
	} catch (error) {
		// record the failure on the Scan row, then rethrow so the caller sees the original error
		const message = error instanceof Error ? error.message : String(error)
		await db
			.update(scans)
			.set({ status: "failed", error: message, finishedAt: new Date() })
			.where(eq(scans.id, scan.id))
		throw error
	}
}

// pure aggregation over Source outcomes: dedupe Resources across Sources, sum cost, decide the status
export function toScanSummary(outcomes: SourceOutcome[]): ScanSummary {
	// dedupe emitted Resources across Sources by url, sum cost, and collect Sources that ran a keyless fallback
	const resourceByUrl = new Map<string, NewResource>()
	const degradedSources: DegradedSource[] = []
	let cost = 0
	for (const outcome of outcomes) {
		// skips and failures contribute no Resources, cost, or degradation
		if (outcome.status !== "ok") {
			continue
		}
		// a keyless fallback still succeeds, but is recorded so the Scan traces the degradation
		if (outcome.fallbackMode) {
			degradedSources.push({ sourceId: outcome.sourceId, fallbackMode: outcome.fallbackMode })
		}
		// sum this Source's cost and merge its Resources, keeping the first seen per url
		cost += outcome.cost
		for (const resource of outcome.resources) {
			if (!resourceByUrl.has(resource.url)) {
				resourceByUrl.set(resource.url, resource)
			}
		}
	}
	// a Scan failed only when a Source errored and none succeeded; skips and an empty topic stay succeeded
	const hasFailures =
		outcomes.some((outcome) => outcome.status === "failed") && !outcomes.some((outcome) => outcome.status === "ok")

	// annotate status with the column's enum type so it does not widen to string
	const resources = [...resourceByUrl.values()]
	const status: (typeof scans.$inferSelect)["status"] = hasFailures ? "failed" : "succeeded"
	return { resources, foundCount: resources.length, cost, status, degradedSources }
}

// run one Source through its registered adapter, turning any failure into an isolated outcome
async function ingestSource(source: Source): Promise<SourceOutcome> {
	// a kind with no registered adapter is a no-op skip, not a Scan failure
	const adapter = sourceAdapters[source.kind]
	if (!adapter) {
		return { status: "skipped" }
	}
	// a thrown adapter degrades only this Source: log it and report failure to the tally
	try {
		return { status: "ok", sourceId: source.id, ...(await adapter(source)) }
	} catch (error) {
		console.error(`source ${source.id} (${source.kind}) failed`, error)
		return { status: "failed" }
	}
}
