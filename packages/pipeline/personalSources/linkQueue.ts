// personal sources ingesters expose public URL-derived Resources and keep private provenance in Topic-local reads

import type { PersonalSourceScoreBonus } from "@carlnotes/contracts/sourceScoring"
import { claimPersonalSourcesLinks, loadClaimedPersonalSourcesLinks } from "@carlnotes/db/personalSourcesLinkQueue"
import type { DiscoveredResource, IngestContext, IngestResult, Source } from "../ingest/ingester"
import { toFallbackTitle, toResourceKind } from "../ingest/normalize"

/**
 * Reads one Personal source's durable queue without copying private text into a global Resource.
 */
export async function ingestPersonalSourcesLinks(source: Source, context?: IngestContext): Promise<IngestResult> {
	if (!context?.scanId) {
		return { resources: [], costDollars: 0 }
	}
	const links = await claimPersonalSourcesLinks({ sourceId: source.id, scanId: context.scanId })
	return {
		resources: links.map(({ url }) => ({
			url,
			title: toFallbackTitle(url, null),
			kind: toResourceKind(url),
			snippet: null,
			isFromPersonalSources: true,
		})),
		costDollars: 0,
	}
}

/**
 * Drops stale personal-only discoveries and reloads score bonuses for the receiving Topic.
 */
export async function loadPersonalSourcesReviewLinks({
	topicId,
	scanId,
	discoveredResources,
}: {
	topicId: string
	scanId: string
	discoveredResources: DiscoveredResource[]
}): Promise<{
	discoveredResources: DiscoveredResource[]
	personalSourceScoreBonuses: Map<string, PersonalSourceScoreBonus>
	claimedUrls: Set<string>
}> {
	const links = await loadClaimedPersonalSourcesLinks({ topicId, scanId })
	const liveUrls = new Set(links.map(({ url }) => url))

	// retain the strongest contribution when several senders supplied the same URL
	const personalSourceScoreBonuses = new Map<string, PersonalSourceScoreBonus>()
	for (const link of links) {
		const previousBonus = personalSourceScoreBonuses.get(link.url) ?? 0
		if (link.personalSourceScoreBonus > previousBonus) {
			personalSourceScoreBonuses.set(link.url, link.personalSourceScoreBonus)
		}
	}
	return {
		claimedUrls: liveUrls,
		discoveredResources: discoveredResources.filter(
			(resource) => !resource.isFromPersonalSources || liveUrls.has(resource.url),
		),
		personalSourceScoreBonuses,
	}
}
