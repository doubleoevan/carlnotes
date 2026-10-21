// the ingest stage: run a topic's Sources through their ingesters, dedupe what they find, and store it

import { toDefaultSource } from "@carlnotes/contracts/sources"
import { db } from "@carlnotes/db"
import { resources, type scans } from "@carlnotes/db/schema/scans"
import { sources } from "@carlnotes/db/schema/topics"
import { deleteStoredObject, toResourceContentKey, uploadResourceContent } from "@carlnotes/db/store"
import { type Budget, charge } from "@carlnotes/models/budget"
import { traceStage } from "@carlnotes/models/telemetry"
import { reportError } from "@carlnotes/server/monitoring"
import { FetchStatusError, OversizedBodyError } from "@carlnotes/server/publicFetch"
import { eq, sql } from "drizzle-orm"
import { blueskyIngester } from "./bluesky"
import type { FetchedBody, IngestContext, IngestedResource, IngestResult, Source, SourceIngester } from "./ingester"
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

// the ingester registry maps each source kind to its ingester
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

// the outcome of running one Source
export type SourceOutcome =
	| ({ status: "ok"; sourceId: string; sourceKind: string } & IngestResult)
	| ({ status: "fallback"; sourceId: string; sourceKind: string } & IngestResult)
	| { status: "failed"; sourceId: string; sourceKind: string; reason: string }
	| { status: "skipped"; sourceId: string; sourceKind: string }

// what the Sources turned up, aggregated across all of them. cost is what they charged, which adds to the Scan's Budget
export type ScanSummary = {
	resources: (IngestedResource & { isFromCustomSource: boolean })[]
	foundCount: number
	costDollars: number
	status: Scan["status"]
	problemSources: ProblemSource[]
}

// what ingest returns to the Scan. the summary, plus each Source's own outcome for the Scan report
export type IngestOutcome = { sourceOutcomes: SourceOutcome[]; summary: ScanSummary }

// the topic whose Sources run, the Scan's Budget, and the Scan owner's LiteLLM key that bills an ingester's model calls
type IngestFromTopicSourcesOptions = { topicId: string; budget: Budget; litellmApiKey?: string }

/**
 * Ingests every Source on the topic and stores the deduped Resources, charging what the Sources cost to the Budget.
 */
export async function ingestFromTopicSources({
	topicId,
	budget,
	litellmApiKey,
}: IngestFromTopicSourcesOptions): Promise<IngestOutcome> {
	// read the topic's Sources and run each through its ingester, with per-Source failures isolated
	const topicSources = await db.select().from(sources).where(eq(sources.topicId, topicId))
	const ingestOutcome = await traceStage(
		"ingest",
		budget,
		async () => {
			const sourceOutcomes = await Promise.all(
				topicSources.map((source) => ingestFromSource(source, { litellmApiKey })),
			)
			const summary = toScanSummary(sourceOutcomes)
			// only a paid source like the web search reports a cost
			charge(budget, "ingestion", summary.costDollars)
			return { sourceOutcomes, summary }
		},
		(result) => ({ sourceCount: topicSources.length, foundCount: result.summary.foundCount }),
	)

	// insert the deduped Resources
	if (ingestOutcome.summary.resources.length > 0) {
		const resourceRows = await db
			.insert(resources)
			.values(ingestOutcome.summary.resources.map(({ fetchedBody, isFromCustomSource, ...resource }) => resource))
			.onConflictDoUpdate({
				target: resources.url,
				set: { engagement: sql`coalesce(excluded.engagement, ${resources.engagement})` },
			})
			.returning({ id: resources.id, url: resources.url })
		await storeFetchedBodies(
			ingestOutcome.summary.resources,
			new Map(resourceRows.map((resourceRow) => [resourceRow.url, resourceRow.id])),
		)
	}
	return ingestOutcome
}

// store the bodies the ingesters already fetched, so the review reuses them instead of scraping the same page again
async function storeFetchedBodies(ingestedResources: IngestedResource[], idByUrl: Map<string, string>): Promise<void> {
	const resourceBodies = ingestedResources.flatMap((resource) => {
		const resourceId = idByUrl.get(resource.url)
		return resource.fetchedBody && resourceId ? [{ resourceId, fetchedBody: resource.fetchedBody }] : []
	})
	await Promise.all(resourceBodies.map(({ resourceId, fetchedBody }) => storeFetchedBody(resourceId, fetchedBody)))
}

// write one resource body to object storage and save what the review's reuse rule reads
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
		await deleteStoredObject(toResourceContentKey(resourceId))
	}
}

/**
 * Whether a Source failure is the host rejecting the request instead of a fault in this code.
 */
export function isHostRejection(error: unknown): boolean {
	if (error instanceof OversizedBodyError) {
		return true
	}

	// a 5xx is the host failing instead of rejecting the request, and can be a request this code sent wrong
	return error instanceof FetchStatusError && error.status < 500
}

/**
 * Pure aggregation over Source outcomes. Dedupes Resources by canonical url, sums cost, and decides the status.
 */
export function toScanSummary(outcomes: SourceOutcome[]): ScanSummary {
	// dedupe the found Resources across Sources by canonical url
	const resourceByUrl = new Map<string, IngestedResource & { isFromCustomSource: boolean }>()
	const problemSources: ProblemSource[] = []
	let costDollars = 0
	for (const outcome of outcomes) {
		// a Source that fell back, failed, or was skipped is traced on the Scan
		const problemSource = toProblemSource(outcome)
		if (problemSource) {
			problemSources.push(problemSource)
		}

		// a failed or skipped Source contributes no Resources and no cost
		if (outcome.status !== "ok" && outcome.status !== "fallback") {
			continue
		}

		// sum this Source's cost. a Source of no default kind is a custom Source
		costDollars += outcome.costDollars
		const isCustomSource = toDefaultSource(outcome.sourceKind) === null

		// merge its Resources, keeping the first one seen per canonical url, and mark a Resource that any custom Source found
		for (const resource of outcome.resources) {
			const canonicalUrl = toCanonicalUrl(resource.url)
			const seenResource = resourceByUrl.get(canonicalUrl)
			if (seenResource) {
				seenResource.isFromCustomSource ||= isCustomSource
				continue
			}

			// a Resource with no title would render as a bare host, so derive one from its snippet or url
			const title = resource.title?.trim() || toFallbackTitle(canonicalUrl, resource.snippet)
			resourceByUrl.set(canonicalUrl, { ...resource, url: canonicalUrl, title, isFromCustomSource: isCustomSource })
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

// the problem a Source hit, or null if it delivered normally
function toProblemSource(sourceOutcome: SourceOutcome): ProblemSource | null {
	// a failed Source is traced with the reason it gave
	if (sourceOutcome.status === "failed") {
		return { sourceId: sourceOutcome.sourceId, status: "failed", reason: sourceOutcome.reason }
	}

	// a skipped source is recorded on the scan row
	if (sourceOutcome.status === "skipped") {
		return { sourceId: sourceOutcome.sourceId, status: "skipped" }
	}

	// a source that ran its primary path hit no problem
	if (!sourceOutcome.fallbackMode) {
		return null
	}
	return { sourceId: sourceOutcome.sourceId, status: "fallback", fallbackMode: sourceOutcome.fallbackMode }
}

// run a Source through its registered ingester, turning any failure into an isolated outcome
async function ingestFromSource(source: Source, ingestContext: IngestContext): Promise<SourceOutcome> {
	// a Source that has not passed its llm-guard screen is skipped before its ingester is reached
	if (source.status !== "ready") {
		return { status: "skipped", sourceId: source.id, sourceKind: source.kind }
	}

	// a source kind with no registered ingester is a no-op skip, not a Scan failure
	const ingester = sourceIngesters[source.kind]
	if (!ingester) {
		return { status: "skipped", sourceId: source.id, sourceKind: source.kind }
	}

	// run the ingester. an error stops only this Source, so the Scan keeps whatever the other sources found
	try {
		const ingestResult = await ingester(source, ingestContext)
		// a Source that found nothing is reported as a fallback
		const status = ingestResult.resources.length === 0 ? "fallback" : "ok"
		return { status, sourceId: source.id, sourceKind: source.kind, ...ingestResult }
	} catch (error) {
		// log every failure, but only report the failures our code could be at fault for
		console.error(`source ${source.id} (${source.kind}) failed`, error)
		if (!isHostRejection(error)) {
			reportError(error, "ingest", { sourceId: source.id, sourceKind: source.kind })
		}
		const reason = (error instanceof Error ? error.message : String(error)).slice(0, MAX_FAILURE_REASON_CHARS)
		return { status: "failed", sourceId: source.id, sourceKind: source.kind, reason }
	}
}
