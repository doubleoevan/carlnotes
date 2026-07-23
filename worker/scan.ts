// scan orchestration. runs a topic's Sources through their adapters, stores the deduped Resources, and records the Scan
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { resources, scans, sources } from "../db/schema"
import { sourceAdapters } from "./adapters"
import type { AdapterResult, NewResource, Source } from "./adapters/adapter"
import { reviewScan } from "./review"

// the outcome of running one Source. every variant carries the Source kind so the scan report can name it
// a successful outcome adds its emitted Resources and the source id for tracing
type SourceOutcome =
	| ({ status: "ok"; sourceId: string; sourceKind: string } & AdapterResult)
	| { status: "failed"; sourceKind: string }
	| { status: "skipped"; sourceKind: string }

// a persisted Scan row and one entry of its per-Source fallback trace
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

// shared so that propagateAttributes and startActiveObservation always agree on the trace name
const TOPIC_SCAN_TRACE_NAME = "topic-scan"

// create a Scan and ingest every Source with failures isolated,
// then review the results and end the Scan with its counts and cost
export async function runTopicScan(topicId: string): Promise<Scan | undefined> {
	// open the Scan as "running" so that interrupted ingestion is visible as an unfinished row
	const [scan] = await db.insert(scans).values({ topicId }).returning()
	if (!scan) {
		throw new Error(`could not create scan for topic ${topicId}`)
	}

	// every model call made while this Scan runs nests under one shared Langfuse trace span
	return propagateAttributes({ traceName: TOPIC_SCAN_TRACE_NAME, metadata: { topicId, scanId: scan.id } }, () =>
		startActiveObservation(TOPIC_SCAN_TRACE_NAME, async () => {
			// an infra failure after this point must finalize the Scan as failed
			// never leave it stuck as "running"
			try {
				// run every Source through its adapter with per-Source failures isolated, then aggregate the outcomes
				const topicSources = await db.select().from(sources).where(eq(sources.topicId, topicId))
				const sourceOutcomes = await Promise.all(topicSources.map(ingestSource))
				const summary = toScanSummary(sourceOutcomes)

				// insert the deduped Resources, skipping urls already stored so existing resources leaving embeddings intact
				if (summary.resources.length > 0) {
					await db.insert(resources).values(summary.resources).onConflictDoNothing({ target: resources.url })
				}

				// review the discovered Resources for topic findings, then end the Scan with one database write
				// sourceOutcomes rides along so the report can describe each Source's outcome
				const review = await reviewScan(scan, summary.resources, sourceOutcomes)
				const { foundCount, cost, status, degradedSources } = summary
				const [finishedScan] = await db
					.update(scans)
					.set({
						// ingestion outcomes
						status,
						foundCount,
						degradedSources,
						// review outcomes, folded into the Scan record
						keptCount: review.keptCount,
						filteredCount: review.filteredCount,
						stageCosts: review.stageCosts,
						scanSummary: review.scanSummary,
						// the total cost is the ingestion cost plus every review stage cost
						cost: (cost + review.cost).toString(),
						finishedAt: new Date(),
					})
					.where(eq(scans.id, scan.id))
					.returning()
				return finishedScan
			} catch (error) {
				// record a failure on the Scan row
				const message = error instanceof Error ? error.message : String(error)
				await db
					.update(scans)
					.set({ status: "failed", error: message, finishedAt: new Date() })
					.where(eq(scans.id, scan.id))

				// rethrow so the caller sees the original error
				throw error
			}
		}),
	)
}

// pure aggregation over Source outcomes. dedupes Resources across Sources, sums cost, and decides the status
export function toScanSummary(outcomes: SourceOutcome[]): ScanSummary {
	// dedupe emitted Resources across Sources by url
	// sum the cost, and collect the Sources that ran a missing API key fallback
	const resourceByUrl = new Map<string, NewResource>()
	const degradedSources: DegradedSource[] = []
	let cost = 0
	for (const outcome of outcomes) {
		// skips and failures do not add Resources, cost, or degradations
		if (outcome.status !== "ok") {
			continue
		}

		// a missing API key fallback still succeeds, but it's recorded to the Scan
		if (outcome.fallbackMode) {
			degradedSources.push({ sourceId: outcome.sourceId, fallbackMode: outcome.fallbackMode })
		}

		// sum this Source's cost and merge its Resources, keeping the first resource seen per url
		cost += outcome.cost
		for (const resource of outcome.resources) {
			if (!resourceByUrl.has(resource.url)) {
				resourceByUrl.set(resource.url, resource)
			}
		}
	}

	// a Scan fails only when a Source errored and none succeeded. skips and an empty topic stay succeeded
	const hasFailures =
		outcomes.some((outcome) => outcome.status === "failed") && !outcomes.some((outcome) => outcome.status === "ok")

	// annotate the status with the column's enum type
	const resources = [...resourceByUrl.values()]
	const status: (typeof scans.$inferSelect)["status"] = hasFailures ? "failed" : "succeeded"
	return { resources, foundCount: resources.length, cost, status, degradedSources }
}

// run a Source through its registered adapter, turning any failure into an isolated outcome
async function ingestSource(source: Source): Promise<SourceOutcome> {
	// a source kind with no registered adapter is a no-op skip, not a Scan failure
	const adapter = sourceAdapters[source.kind]
	if (!adapter) {
		return { status: "skipped", sourceKind: source.kind }
	}

	// a thrown adapter degrades only this Source. log it and add a failure to the outcome
	try {
		const adapterResult = await adapter(source)
		return { status: "ok", sourceId: source.id, sourceKind: source.kind, ...adapterResult }
	} catch (error) {
		console.error(`source ${source.id} (${source.kind}) failed`, error)
		return { status: "failed", sourceKind: source.kind }
	}
}
