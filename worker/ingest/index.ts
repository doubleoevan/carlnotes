// the ingest stage: run a topic's Sources through their ingesters, dedupe what they emit, and store it.
// one failing Source stops only itself, so a Scan still succeeds on whatever the other Sources found
import { reportError } from "@shared/monitoring"
import { eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { resources, type scans, sources } from "../../db/schema"
import { type Budget, charge } from "../budget"
import { traceStage } from "../telemetry"
import type { IngestResult, NewResource, Source, SourceIngester } from "./ingester"
import { toCanonicalUrl, toFallbackTitle } from "./normalize"
import { redditIngester } from "./reddit"
import { rssIngester } from "./rss"
import { searchIngester } from "./search"
import { urlIngester } from "./url"
import { youtubeIngester } from "./youtube"

// the ingester registry maps each source kind to its ingester. a new source kind adds one line here.
// composio and plugin have no ingesters yet, so the record is Partial and a lookup can miss
const sourceIngesters: Partial<Record<Source["kind"], SourceIngester>> = {
	url: urlIngester,
	rss: rssIngester,
	reddit: redditIngester,
	youtube: youtubeIngester,
	search: searchIngester,
}

// the stored Scan row, and one entry of the fallback list it keeps per Source
type Scan = typeof scans.$inferSelect
type FallbackSource = Scan["fallbackSources"][number]

// the outcome of running one Source. every variant includes the Source kind so the Scan report can name it
// a successful outcome adds its emitted Resources and the source id for tracing
// a Source that ran without erroring but emitted nothing is a fallback, not an ok
export type SourceOutcome =
	| ({ status: "ok"; sourceId: string; sourceKind: string } & IngestResult)
	| ({ status: "fallback"; sourceId: string; sourceKind: string } & IngestResult)
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

// what ingest hands back to the Scan. the summary, plus each Source's own outcome for the Scan report
export type IngestOutcome = { sourceOutcomes: SourceOutcome[]; summary: ScanSummary }

/**
 * Ingest every Source on the topic and store the deduped Resources, charging what the Sources cost to the Budget.
 */
export async function ingestFromTopicSources(topicId: string, budget: Budget): Promise<IngestOutcome> {
	// read the topic's Sources and run each through its ingester, with per-Source failures isolated.
	// the charge happens inside the span, so the ingest stage's cost lands on the span that spent it
	const topicSources = await db.select().from(sources).where(eq(sources.topicId, topicId))
	const ingestOutcome = await traceStage(
		"ingest",
		budget,
		async () => {
			const sourceOutcomes = await Promise.all(topicSources.map(ingestFromSource))
			const summary = toScanSummary(sourceOutcomes)
			// only a paid source like the web search reports a cost
			charge(budget, "ingestion", summary.cost)
			return { sourceOutcomes, summary }
		},
		(result) => ({ sourceCount: topicSources.length, foundCount: result.summary.foundCount }),
	)

	// insert the deduped Resources. an already-stored url keeps everything but its engagement score,
	// and coalesce keeps the stored engagement score when a re-discovery includes no engagement value
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
 * Pure aggregation over Source outcomes. Dedupes Resources by canonical url, sums cost, and decides the status.
 */
export function toScanSummary(outcomes: SourceOutcome[]): ScanSummary {
	// dedupe the emitted Resources across Sources by canonical url. sum the cost,
	// and collect the Sources that fell back to a keyless path
	const resourceByUrl = new Map<string, NewResource>()
	const fallbackSources: FallbackSource[] = []
	let cost = 0
	for (const outcome of outcomes) {
		// skips and failures do not add Resources, cost, or fallbacks
		if (outcome.status !== "ok" && outcome.status !== "fallback") {
			continue
		}

		// a missing API key fallback still succeeds, but it's recorded to the Scan
		if (outcome.fallbackMode) {
			fallbackSources.push({ sourceId: outcome.sourceId, fallbackMode: outcome.fallbackMode })
		}

		// sum this Source's cost and merge its Resources, keeping the first one seen per canonical url
		// so that two links to the same page collapse instead of storing twice
		cost += outcome.cost
		for (const resource of outcome.resources) {
			const canonicalUrl = toCanonicalUrl(resource.url)
			if (!resourceByUrl.has(canonicalUrl)) {
				// a Resource with no title would render as a bare host, so derive one from its snippet or url
				const title = resource.title?.trim() || toFallbackTitle(canonicalUrl, resource.snippet)
				resourceByUrl.set(canonicalUrl, { ...resource, url: canonicalUrl, title })
			}
		}
	}

	// a Scan fails only when a Source errored and none ran clean
	const hasFailureWithoutSuccess =
		outcomes.some((outcome) => outcome.status === "failed") &&
		!outcomes.some((outcome) => outcome.status === "ok" || outcome.status === "fallback")

	// collect the deduped Resources and the status that the Scan row includes
	const ingestedResources = [...resourceByUrl.values()]
	const status: Scan["status"] = hasFailureWithoutSuccess ? "failed" : "succeeded"
	return { resources: ingestedResources, foundCount: ingestedResources.length, cost, status, fallbackSources }
}

// run a Source through its registered ingester, turning any failure into an isolated outcome
async function ingestFromSource(source: Source): Promise<SourceOutcome> {
	// a source kind with no registered ingester is a no-op skip, not a Scan failure
	const ingester = sourceIngesters[source.kind]
	if (!ingester) {
		return { status: "skipped", sourceKind: source.kind }
	}

	// run the ingester. an error stops only this Source, so the Scan keeps whatever the other sources found
	try {
		const ingestResult = await ingester(source)
		// a Source that emitted nothing is reported as a fallback,
		// so a feed that has gone dead stops reading as one that found nothing new
		const status = ingestResult.resources.length === 0 ? "fallback" : "ok"
		return { status, sourceId: source.id, sourceKind: source.kind, ...ingestResult }
	} catch (error) {
		// log and report the failure, then return this Source with a failed status
		console.error(`source ${source.id} (${source.kind}) failed`, error)
		reportError(error, "ingest", { sourceId: source.id, sourceKind: source.kind })
		return { status: "failed", sourceKind: source.kind }
	}
}
