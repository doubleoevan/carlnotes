// the ingest stage: run a topic's Sources through their ingesters, dedupe what they find, and store it.
// one failing Source stops only itself, so a Scan still succeeds on whatever the other Sources found
import { reportError } from "@shared/monitoring"
import { eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { resources, type scans, sources } from "../../db/schema"
import { type Budget, charge } from "../budget"
import { deleteResourceContent, toResourceContentKey, uploadResourceContent } from "../store"
import { traceStage } from "../telemetry"
import { blueskyIngester } from "./bluesky"
import type { FetchedBody, IngestedResource, IngestResult, Source, SourceIngester } from "./ingester"
import { toCanonicalUrl, toFallbackTitle } from "./normalize"
import { podcastIngester } from "./podcast"
import { redditIngester } from "./reddit"
import { rssIngester } from "./rss"
import { searchIngester } from "./search"
import { urlIngester } from "./url"
import { xIngester } from "./x"
import { youtubeIngester } from "./youtube"

// how much of a failure message the Scan's trace keeps.
const MAX_FAILURE_REASON_CHARS = 300

// the ingester registry maps each source kind to its ingester. a new source kind adds one line here.
// composio and plugin have no ingesters yet, so the record is Partial and a lookup can miss
const sourceIngesters: Partial<Record<Source["kind"], SourceIngester>> = {
	url: urlIngester,
	rss: rssIngester,
	reddit: redditIngester,
	youtube: youtubeIngester,
	podcast: podcastIngester,
	search: searchIngester,
	bluesky: blueskyIngester,
	x: xIngester,
}

// the stored Scan row, and one entry of what it records per Source that hit a problem
type Scan = typeof scans.$inferSelect
type ProblemSource = Scan["problemSources"][number]

// the outcome of running one Source. every variant includes the Source kind so the Scan report can name it
// a successful outcome adds its found Resources and the source id for tracing
// a Source that ran without erroring but found nothing is a fallback, not an ok
// a failed outcome includes the reason it failed, so a blocked Source reads as blocked
export type SourceOutcome =
	| ({ status: "ok"; sourceId: string; sourceKind: string } & IngestResult)
	| ({ status: "fallback"; sourceId: string; sourceKind: string } & IngestResult)
	| { status: "failed"; sourceId: string; sourceKind: string; reason: string }
	| { status: "skipped"; sourceKind: string }

// what the Sources turned up, aggregated across all of them. cost is what they charged, which adds to the Scan's Budget
export type ScanSummary = {
	resources: IngestedResource[]
	foundCount: number
	costDollars: number
	status: Scan["status"]
	problemSources: ProblemSource[]
}

// what ingest hands back to the Scan. the summary, plus each Source's own outcome for the Scan report
export type IngestOutcome = { sourceOutcomes: SourceOutcome[]; summary: ScanSummary }

/**
 * Ingest every Source on the topic and store the deduped Resources, charging what the Sources cost to the Budget.
 */
export async function ingestFromTopicSources(topicId: string, budget: Budget): Promise<IngestOutcome> {
	// read the topic's Sources and run each through its ingester, with per-Source failures isolated.
	// the charge happens inside the span, so the ingest stage's cost is recorded on the span that spent it
	const topicSources = await db.select().from(sources).where(eq(sources.topicId, topicId))
	const ingestOutcome = await traceStage(
		"ingest",
		budget,
		async () => {
			const sourceOutcomes = await Promise.all(topicSources.map(ingestFromSource))
			const summary = toScanSummary(sourceOutcomes)
			// only a paid source like the web search reports a cost
			charge(budget, "ingestion", summary.costDollars)
			return { sourceOutcomes, summary }
		},
		(result) => ({ sourceCount: topicSources.length, foundCount: result.summary.foundCount }),
	)

	// insert the deduped Resources. an already-stored url keeps everything but its engagement score,
	// and coalesce keeps the stored engagement score when a re-discovery includes no engagement value.
	// the body an ingester sent is not a column, so it is stripped here and stored once the rows have ids
	if (ingestOutcome.summary.resources.length > 0) {
		const storedRows = await db
			.insert(resources)
			.values(ingestOutcome.summary.resources.map(({ fetchedBody, ...resource }) => resource))
			.onConflictDoUpdate({
				target: resources.url,
				set: { engagement: sql`coalesce(excluded.engagement, ${resources.engagement})` },
			})
			.returning({ id: resources.id, url: resources.url })
		await storeFetchedBodies(ingestOutcome.summary.resources, new Map(storedRows.map((row) => [row.url, row.id])))
	}
	return ingestOutcome
}

// store the bodies the ingesters already fetched, so the review reuses them instead of scraping the same page again.
// a Resource whose store fails keeps content_key unset, which is the state every other Resource is in,
// the review fetches the resource on its own terms, and only the ingester's fetch is wasted
async function storeFetchedBodies(ingestedResources: IngestedResource[], idByUrl: Map<string, string>): Promise<void> {
	const resourceBodies = ingestedResources.flatMap((resource) => {
		const resourceId = idByUrl.get(resource.url)
		return resource.fetchedBody && resourceId ? [{ resourceId, fetchedBody: resource.fetchedBody }] : []
	})
	await Promise.all(resourceBodies.map(({ resourceId, fetchedBody }) => storeFetchedBody(resourceId, fetchedBody)))
}

// write one resource body to object storage and save what the review's reuse rule reads: the key, the size, the validators, and when it was fetched
async function storeFetchedBody(resourceId: string, fetchedBody: FetchedBody): Promise<void> {
	try {
		const { contentKey, bytes } = await uploadResourceContent(resourceId, fetchedBody.markdown)
		await db
			.update(resources)
			.set({
				contentKey,
				contentBytes: bytes,
				etag: fetchedBody.etag,
				lastModified: fetchedBody.lastModified,
				fetchedAt: new Date(),
			})
			.where(eq(resources.id, resourceId))
	} catch (error) {
		// the row keeps content_key unset, so nothing points at a half-written object, and review refetches
		console.error(`object-storage write failed for ingested resource ${resourceId}`, error)
		reportError(error, "object-storage", { resourceId, operation: "write" })
		await deleteResourceContent(toResourceContentKey(resourceId)).catch(() => {})
	}
}

/**
 * Pure aggregation over Source outcomes. Dedupes Resources by canonical url, sums cost, and decides the status.
 */
export function toScanSummary(outcomes: SourceOutcome[]): ScanSummary {
	// dedupe the found Resources across Sources by canonical url. sum the cost,
	// and collect the Sources that did not deliver normally
	const resourceByUrl = new Map<string, IngestedResource>()
	const problemSources: ProblemSource[] = []
	let costDollars = 0
	for (const outcome of outcomes) {
		// a Source that fell back or failed is traced on the Scan either way
		const problemSource = toProblemSource(outcome)
		if (problemSource) {
			problemSources.push(problemSource)
		}

		// a failed or skipped Source contributes no Resources and no cost
		if (outcome.status !== "ok" && outcome.status !== "fallback") {
			continue
		}

		// sum this Source's cost and merge its Resources, keeping the first one seen per canonical url
		// so that two links to the same page collapse instead of storing twice
		costDollars += outcome.costDollars
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
	return { resources: ingestedResources, foundCount: ingestedResources.length, costDollars, status, problemSources }
}

// the problem one Source hit, or null when it delivered normally
function toProblemSource(outcome: SourceOutcome): ProblemSource | null {
	// a failed Source is traced with the reason it gave
	if (outcome.status === "failed") {
		return { sourceId: outcome.sourceId, status: "failed", reason: outcome.reason }
	}

	// a skip ran no ingester at all, and a Source that ran its primary path hit no problem
	if (outcome.status === "skipped" || !outcome.fallbackMode) {
		return null
	}
	return { sourceId: outcome.sourceId, status: "fallback", fallbackMode: outcome.fallbackMode }
}

// run a Source through its registered ingester, turning any failure into an isolated outcome
async function ingestFromSource(source: Source): Promise<SourceOutcome> {
	// a Source that has not passed its llm-guard screen is skipped before its ingester is reached,
	// so an unscreened url isn't fetched into a Resource.
	if (source.status !== "ready") {
		return { status: "skipped", sourceKind: source.kind }
	}

	// a source kind with no registered ingester is a no-op skip, not a Scan failure
	const ingester = sourceIngesters[source.kind]
	if (!ingester) {
		return { status: "skipped", sourceKind: source.kind }
	}

	// run the ingester. an error stops only this Source, so the Scan keeps whatever the other sources found
	try {
		const ingestResult = await ingester(source)
		// a Source that found nothing is reported as a fallback,
		// so a feed that has gone dead stops reading as one that found nothing new
		const status = ingestResult.resources.length === 0 ? "fallback" : "ok"
		return { status, sourceId: source.id, sourceKind: source.kind, ...ingestResult }
	} catch (error) {
		// log and report the failure, then return this Source with a failed status and the reason,
		// which the Scan traces and the scan report names
		console.error(`source ${source.id} (${source.kind}) failed`, error)
		reportError(error, "ingest", { sourceId: source.id, sourceKind: source.kind })
		const reason = (error instanceof Error ? error.message : String(error)).slice(0, MAX_FAILURE_REASON_CHARS)
		return { status: "failed", sourceId: source.id, sourceKind: source.kind, reason }
	}
}
