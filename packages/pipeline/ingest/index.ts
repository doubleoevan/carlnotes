// the ingest stage: run a topic's Sources through their ingesters, dedupe what they find, credit each Resource to one
// Source, and store it

import { toDefaultSource, toSourceResultLabel } from "@carlnotes/contracts/sources"
import { SOURCE_RESULT_REASON_CHARS, type StoredSourceResult } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { resources, type scans } from "@carlnotes/db/schema/scans"
import { sources } from "@carlnotes/db/schema/topics"
import { deleteStoredObject, toResourceContentKey, uploadResourceContent } from "@carlnotes/db/store"
import { type Budget, charge } from "@carlnotes/models/budget"
import { traceStage } from "@carlnotes/models/telemetry"
import { reportError } from "@carlnotes/server/monitoring"
import { isHostRejection } from "@carlnotes/server/publicFetch"
import { asc, eq, sql } from "drizzle-orm"
import type { ScannedSource } from "../review/summarize"
import { blueskyIngester } from "./bluesky"
import type {
	DiscoveredResource,
	FetchedBody,
	IngestContext,
	IngestedResource,
	IngestResult,
	Source,
	SourceIngester,
} from "./ingester"
import { toCanonicalUrl, toFallbackTitle } from "./normalize"
import { podcastIngester } from "./podcast"
import { redditIngester } from "./reddit"
import { rssIngester } from "./rss"
import { searchIngester } from "./search"
import { urlIngester } from "./url"
import { xIngester } from "./x"
import { youtubeIngester } from "./youtube"

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

// the fields every Source outcome has: the Source, its label, and how long its ingester ran
type SourceOutcomeFields = { sourceId: string; sourceKind: string; label: string; durationMs: number }

// the outcome of running one Source
export type SourceOutcome =
	| ({ status: "ok" } & SourceOutcomeFields & IngestResult)
	| ({ status: "fallback" } & SourceOutcomeFields & IngestResult)
	| ({ status: "failed"; reason: string } & SourceOutcomeFields)
	| ({ status: "skipped" } & SourceOutcomeFields)

// a Resource that survived the merge, whether a custom Source found it, and the Source credited with it
type CreditedResource = IngestedResource & Pick<DiscoveredResource, "isFromCustomSource" | "sourceId">

// what the Sources turned up, aggregated across all of them. cost is what they charged, which adds to the Scan's Budget.
// sourceResults has one result per Source, in the order the Sources were read, oldest first
export type ScanSummary = {
	resources: CreditedResource[]
	foundCount: number
	costDollars: number
	status: Scan["status"]
	problemSources: ProblemSource[]
	sourceResults: StoredSourceResult[]
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
	// read the topic's Sources oldest first, so the merge credits a Resource that two Sources found to the older one
	const topicSources = await db
		.select()
		.from(sources)
		.where(eq(sources.topicId, topicId))
		.orderBy(asc(sources.createdAt), asc(sources.id))

	// run each Source through its ingester, with per-Source failures isolated, then label each outcome from its row
	const ingestOutcome = await traceStage(
		"ingest",
		budget,
		async () => {
			const ranSourceOutcomes = await Promise.all(
				topicSources.map((source) => ingestFromSource(source, { litellmApiKey })),
			)
			const sourceOutcomes = await relabelSourceOutcomes(topicId, ranSourceOutcomes)
			const summary = toScanSummary(sourceOutcomes)
			// only a paid source like the web search reports a cost
			charge(budget, "ingestion", summary.costDollars)
			return { sourceOutcomes, summary }
		},
		(result) => ({ sourceCount: topicSources.length, foundCount: result.summary.foundCount }),
	)

	// insert the deduped Resources. a url already stored keeps every field, and its update sets the url to itself only so
	// the existing row's id comes back beside the new ones
	if (ingestOutcome.summary.resources.length > 0) {
		const resourceRows = await db
			.insert(resources)
			.values(
				ingestOutcome.summary.resources.map(({ fetchedBody, isFromCustomSource, sourceId, ...resource }) => resource),
			)
			.onConflictDoUpdate({ target: resources.url, set: { url: sql`excluded.url` } })
			.returning({ id: resources.id, url: resources.url })
		await storeFetchedBodies(
			ingestOutcome.summary.resources,
			new Map(resourceRows.map((resourceRow) => [resourceRow.url, resourceRow.id])),
		)
	}
	return ingestOutcome
}

// label each outcome from its Source's row as it stands after the ingesters ran. an ingester may save a name, such as
// a YouTube channel's, and a Source deleted during the ingest keeps the label from the row read at the start
async function relabelSourceOutcomes(topicId: string, sourceOutcomes: SourceOutcome[]): Promise<SourceOutcome[]> {
	const topicSourceRows = await db
		.select({ id: sources.id, kind: sources.kind, config: sources.config })
		.from(sources)
		.where(eq(sources.topicId, topicId))
	const labelBySourceId = new Map(
		topicSourceRows.map((topicSourceRow) => [
			topicSourceRow.id,
			toSourceResultLabel(topicSourceRow.kind, topicSourceRow.config),
		]),
	)
	return sourceOutcomes.map((sourceOutcome) => ({
		...sourceOutcome,
		label: labelBySourceId.get(sourceOutcome.sourceId) ?? sourceOutcome.label,
	}))
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
 * Pure aggregation over Source outcomes. Dedupes Resources by canonical url, credits each to the first Source that
 * returned it, sums cost, decides the status, and returns each Source's result.
 */
export function toScanSummary(outcomes: SourceOutcome[]): ScanSummary {
	// dedupe the found Resources across Sources by canonical url
	const resourceByUrl = new Map<string, CreditedResource>()
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

		// merge its Resources, keeping the first one seen per canonical url and crediting it to this Source, and mark a
		// Resource that any custom Source found
		for (const resource of outcome.resources) {
			const canonicalUrl = toCanonicalUrl(resource.url)
			const seenResource = resourceByUrl.get(canonicalUrl)
			if (seenResource) {
				seenResource.isFromCustomSource ||= isCustomSource
				continue
			}

			// a Resource with no title would render as a bare host, so derive one from its snippet or url
			const title = resource.title?.trim() || toFallbackTitle(canonicalUrl, resource.snippet)
			resourceByUrl.set(canonicalUrl, {
				...resource,
				url: canonicalUrl,
				title,
				isFromCustomSource: isCustomSource,
				sourceId: outcome.sourceId,
			})
		}
	}

	// a Scan fails only when a Source errored and none ran clean
	const hasFailureWithoutSuccess =
		outcomes.some((outcome) => outcome.status === "failed") &&
		!outcomes.some((outcome) => outcome.status === "ok" || outcome.status === "fallback")

	// collect the deduped Resources, the status that the Scan row includes, and each Source's result
	const ingestedResources = [...resourceByUrl.values()]
	const status: Scan["status"] = hasFailureWithoutSuccess ? "failed" : "succeeded"
	return {
		resources: ingestedResources,
		foundCount: ingestedResources.length,
		costDollars,
		status,
		problemSources,
		sourceResults: toSourceResults(outcomes, ingestedResources),
	}
}

// each Source's result in the order the Sources were read, oldest first. its found count is the number of Resources credited to it
function toSourceResults(outcomes: SourceOutcome[], creditedResources: CreditedResource[]): StoredSourceResult[] {
	// count the Resources credited to each Source
	const foundCountBySourceId = new Map<string, number>()
	for (const creditedResource of creditedResources) {
		foundCountBySourceId.set(creditedResource.sourceId, (foundCountBySourceId.get(creditedResource.sourceId) ?? 0) + 1)
	}
	return outcomes.map((outcome) => toStoredSourceResult(outcome, foundCountBySourceId.get(outcome.sourceId) ?? 0))
}

// one Source's result, with no kept count yet. its cost is what the Scan charged for it: what a Source that ran
// reported, and 0 for one that failed or was skipped
function toStoredSourceResult(sourceOutcome: SourceOutcome, foundCount: number): StoredSourceResult {
	const costDollars =
		sourceOutcome.status === "ok" || sourceOutcome.status === "fallback" ? sourceOutcome.costDollars : 0
	const sourceResultFields = {
		sourceId: sourceOutcome.sourceId,
		sourceKind: sourceOutcome.sourceKind,
		label: sourceOutcome.label,
		foundCount,
		keptCount: 0,
		costDollars,
		durationMs: sourceOutcome.durationMs,
	}

	// the status and its detail are the problem the Source hit, or ok if it hit none
	const problemSource = toProblemSource(sourceOutcome)
	return problemSource ? { ...sourceResultFields, ...problemSource } : { ...sourceResultFields, status: "ok" }
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

/**
 * Returns the four fields of a Source's outcome that the scan report reads, with none of its Resources or page bodies.
 */
export function toScannedSource(sourceOutcome: SourceOutcome): ScannedSource {
	// a failed Source includes its reason
	const { sourceKind, status } = sourceOutcome
	if (status === "failed") {
		return { sourceKind, status, reason: sourceOutcome.reason }
	}

	// a Source fell back only if it reported a fallback mode, and one that found nothing without a mode ran normally
	if (status !== "skipped" && sourceOutcome.fallbackMode) {
		return { sourceKind, status: "fallback", fallbackMode: sourceOutcome.fallbackMode }
	}
	return { sourceKind, status: status === "skipped" ? "skipped" : "ok" }
}

// run a Source through its registered ingester, turning any failure into an isolated outcome
async function ingestFromSource(source: Source, ingestContext: IngestContext): Promise<SourceOutcome> {
	// the fields every outcome of this Source has, labeled from the row read at the start
	const sourceOutcomeFields = {
		sourceId: source.id,
		sourceKind: source.kind,
		label: toSourceResultLabel(source.kind, source.config),
	}

	// a Source that has not passed its screen is skipped before its ingester is reached
	if (source.status !== "ready") {
		return { status: "skipped", ...sourceOutcomeFields, durationMs: 0 }
	}

	// a source kind with no registered ingester is a no-op skip, not a Scan failure
	const ingester = sourceIngesters[source.kind]
	if (!ingester) {
		return { status: "skipped", ...sourceOutcomeFields, durationMs: 0 }
	}

	// run and time the ingester. an error stops only this Source, so the Scan keeps whatever the other sources found
	const startedAt = performance.now()
	try {
		const ingestResult = await ingester(source, ingestContext)
		const durationMs = Math.round(performance.now() - startedAt)
		// a Source that found nothing is reported as a fallback
		const status = ingestResult.resources.length === 0 ? "fallback" : "ok"
		return { status, ...sourceOutcomeFields, durationMs, ...ingestResult }
	} catch (error) {
		// time the failed run, log every failure, and only report the failures our code could be at fault for
		const durationMs = Math.round(performance.now() - startedAt)
		console.error(`source ${source.id} (${source.kind}) failed`, error)
		if (!isHostRejection(error)) {
			reportError(error, "ingest", { sourceId: source.id, sourceKind: source.kind })
		}

		// return the failure with its message, cut to the length a source result keeps
		const reason = (error instanceof Error ? error.message : String(error)).slice(0, SOURCE_RESULT_REASON_CHARS)
		return { status: "failed", ...sourceOutcomeFields, durationMs, reason }
	}
}
