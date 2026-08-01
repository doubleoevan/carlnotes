// the ingest stage: run a topic's Sources through their ingesters, dedupe what they emit, and store it.
// one failing Source degrades only itself, so a Scan still succeeds on whatever the others found
import { reportError } from "@shared/monitoring"
import { eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { resources, type scans, sources } from "../../db/schema"
import { type Budget, charge } from "../budget"
import { traceStage } from "../telemetry"
import type { IngestResult, NewResource, Source, SourceIngester } from "./ingester"
import { redditIngester } from "./reddit"
import { rssIngester } from "./rss"
import { searchIngester } from "./search"
import { youtubeIngester } from "./youtube"

// the ingester registry maps each source kind to its ingester. a new source kind adds one line here.
// composio and plugin have no ingesters yet, so the record is Partial and a lookup can miss
const sourceIngesters: Partial<Record<Source["kind"], SourceIngester>> = {
	rss: rssIngester,
	reddit: redditIngester,
	youtube: youtubeIngester,
	search: searchIngester,
}

// a persisted Scan row and one entry of its per-Source fallback trace
type Scan = typeof scans.$inferSelect
type FallbackSource = Scan["fallbackSources"][number]

// the outcome of running one Source. every variant carries the Source kind so the scan report can name it
// a successful outcome adds its emitted Resources and the source id for tracing
export type SourceOutcome =
	| ({ status: "ok"; sourceId: string; sourceKind: string } & IngestResult)
	| { status: "failed"; sourceKind: string }
	| { status: "skipped"; sourceKind: string }

// what the Sources turned up, aggregated across all of them.
// cost is what they charged, which adds to the Scan's Budget
export type ScanSummary = {
	resources: NewResource[]
	foundCount: number
	cost: number
	status: Scan["status"]
	fallbackSources: FallbackSource[]
}

// what ingest hands back to the Scan: the aggregate, plus each Source's outcome for the scan report
export type IngestOutcome = { sourceOutcomes: SourceOutcome[]; summary: ScanSummary }

/**
 * Ingest every Source on the topic and store the deduped Resources, charging what the Sources cost to the Budget.
 */
export async function ingestFromTopicSources(topicId: string, budget: Budget): Promise<IngestOutcome> {
	// run every Source through its ingester with per-Source failures isolated, then aggregate the outcomes.
	// the charge happens inside the span, so the ingest stage's cost is added to the span that spent it
	const topicSources = await db.select().from(sources).where(eq(sources.topicId, topicId))
	const ingestOutcome = await traceStage(
		"ingest",
		budget,
		async () => {
			const sourceOutcomes = await Promise.all(topicSources.map(ingestFromSource))
			const summary = toScanSummary(sourceOutcomes)
			// only an api keyed paid source like the web search reports a cost
			charge(budget, "ingestion", summary.cost)
			return { sourceOutcomes, summary }
		},
		(result) => ({ sourceCount: topicSources.length, foundCount: result.summary.foundCount }),
	)

	// insert the deduped Resources. an already-stored url keeps its embedding and content.
	// only engagement refreshes, and coalesce keeps the stored score when a re-discovery carries no engagement value
	if (ingestOutcome.summary.resources.length > 0) {
		await db
			.insert(resources)
			.values(ingestOutcome.summary.resources)
			.onConflictDoUpdate({
				target: resources.url,
				set: { engagement: sql`coalesce(excluded.engagement, ${resources.engagement})` },
			})
	}
	return ingestOutcome
}

/**
 * Pure aggregation over Source outcomes. Dedupes Resources across Sources, sums cost, and decides the status.
 */
export function toScanSummary(outcomes: SourceOutcome[]): ScanSummary {
	// dedupe emitted Resources across Sources by url
	// sum the cost, and collect the Sources that ran a missing API key fallback
	const resourceByUrl = new Map<string, NewResource>()
	const fallbackSources: FallbackSource[] = []
	let cost = 0
	for (const outcome of outcomes) {
		// skips and failures do not add Resources, cost, or fallbacks
		if (outcome.status !== "ok") {
			continue
		}

		// a missing API key fallback still succeeds, but it's recorded to the Scan
		if (outcome.fallbackMode) {
			fallbackSources.push({ sourceId: outcome.sourceId, fallbackMode: outcome.fallbackMode })
		}

		// sum this Source's cost and merge its Resources, keeping the first resource seen per url
		cost += outcome.cost
		for (const resource of outcome.resources) {
			if (!resourceByUrl.has(resource.url)) {
				resourceByUrl.set(resource.url, resource)
			}
		}
	}

	// a Scan fails only when a Source errored and none succeeded. skipped sources and empty topics stay succeeded
	const hasFailures =
		outcomes.some((outcome) => outcome.status === "failed") && !outcomes.some((outcome) => outcome.status === "ok")

	// annotate the status with the column's enum type
	const ingestedResources = [...resourceByUrl.values()]
	const status: Scan["status"] = hasFailures ? "failed" : "succeeded"
	return { resources: ingestedResources, foundCount: ingestedResources.length, cost, status, fallbackSources }
}

// run a Source through its registered ingester, turning any failure into an isolated outcome
async function ingestFromSource(source: Source): Promise<SourceOutcome> {
	// a source kind with no registered ingester is a no-op skip, not a Scan failure
	const ingester = sourceIngesters[source.kind]
	if (!ingester) {
		return { status: "skipped", sourceKind: source.kind }
	}

	// a thrown ingester degrades only this Source. log it, report it, and return a failure to add to the outcome
	try {
		const ingestResult = await ingester(source)
		return { status: "ok", sourceId: source.id, sourceKind: source.kind, ...ingestResult }
	} catch (error) {
		// report a source that failed to ingest
		console.error(`source ${source.id} (${source.kind}) failed`, error)
		reportError(error, "ingest", { sourceId: source.id, sourceKind: source.kind })
		return { status: "failed", sourceKind: source.kind }
	}
}
