import type { StoredScanSourceResults, StoredSourceResult } from "@carlnotes/contracts/topics"
import type { DiscoveredResource } from "@carlnotes/pipeline/ingest/ingester"

// a Source's result as ingest returns it, the Resources the Scan discovered, and the urls of the Scan's kept Findings
type ToScanSourceResultsOptions = {
	ingestSourceResults: StoredSourceResult[]
	discoveredResources: DiscoveredResource[]
	keptFindingUrls: string[]
	// the Resources the review read again from the topic's earlier findings, which no Source returned this Scan
	earlierFoundCount: number
}

/**
 * Counts each kept Finding for the Source credited with its Resource, or as earlier if no Source returned it this Scan,
 * beside the earlier Resources the review read again.
 */
export function toScanSourceResults({
	ingestSourceResults,
	discoveredResources,
	keptFindingUrls,
	earlierFoundCount,
}: ToScanSourceResultsOptions): StoredScanSourceResults {
	// the Source each discovered url is credited to
	const sourceIdByUrl = new Map(discoveredResources.map((resource) => [resource.url, resource.sourceId]))

	// the kept count of each Source, and of the findings from earlier scans
	const keptCountBySourceId = new Map<string, number>()
	let earlierKeptCount = 0

	// count each kept url for its Source, or as earlier if this Scan discovered no such url
	for (const keptFindingUrl of keptFindingUrls) {
		const sourceId = sourceIdByUrl.get(keptFindingUrl)
		if (sourceId === undefined) {
			earlierKeptCount += 1
			continue
		}
		keptCountBySourceId.set(sourceId, (keptCountBySourceId.get(sourceId) ?? 0) + 1)
	}

	// put each Source's kept count on its result
	const sourceResults = ingestSourceResults.map((sourceResult) => ({
		...sourceResult,
		keptCount: keptCountBySourceId.get(sourceResult.sourceId) ?? 0,
	}))
	return { sources: sourceResults, earlierKeptCount, earlierFoundCount }
}
