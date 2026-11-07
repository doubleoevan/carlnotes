// personal sources ingesters expose public URL-derived Resources and keep private provenance in Topic-local reads

import { PERSONAL_SOURCE_SCORE_BONUS, type PersonalSourceScoreBonus } from "@carlnotes/contracts/sourceScoring"
import {
	claimPersonalSourcesLinks,
	considerPersonalSourcesLink,
	loadClaimedPersonalSourcesLinks,
} from "@carlnotes/db/personalSourcesLinkQueue"
import { considerCommentLinks, loadWaitingCommentLinkUrls } from "@carlnotes/db/sharedComments"
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

// the Source id a Resource from a shared Comment's link is credited to, which matches no Source
const SHARED_COMMENT_SOURCE_ID = "shared-comments"

/**
 * Returns the Resources for the links in a Topic's shared Comments that no Scan reviewed yet, without the urls a
 * Source already found. Each one is marked as a Personal sources link.
 */
export async function ingestSharedCommentLinks(topicId: string, foundUrls: Set<string>): Promise<DiscoveredResource[]> {
	const urls = await loadWaitingCommentLinkUrls(topicId)
	return urls
		.filter((url) => !foundUrls.has(url))
		.map((url) => ({
			url,
			title: toFallbackTitle(url, null),
			kind: toResourceKind(url),
			snippet: null,
			isFromPersonalSources: true,
			isFromCustomSource: false,
			sourceId: SHARED_COMMENT_SOURCE_ID,
		}))
}

/**
 * Marks a reviewed link as considered in both queues that hold one: a sender's Personal sources, and the Topic's
 * shared Comments.
 */
export async function considerReviewLink(options: Parameters<typeof considerPersonalSourcesLink>[0]): Promise<void> {
	await Promise.all([considerPersonalSourcesLink(options), considerCommentLinks(options.topicId, [options.url])])
}

/**
 * Drops stale personal-only discoveries and reloads score bonuses for the receiving Topic. A link in one of the
 * Topic's shared Comments counts as a deliberate send does.
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
	// what the Sources found without a stale personal-only discovery, each live link's bonus, and every live url
	discoveredResources: DiscoveredResource[]
	personalSourceScoreBonuses: Map<string, PersonalSourceScoreBonus>
	claimedUrls: Set<string>
}> {
	// the senders' claimed links and the shared comments' waiting links
	const [links, commentLinkUrls] = await Promise.all([
		loadClaimedPersonalSourcesLinks({ topicId, scanId }),
		loadWaitingCommentLinkUrls(topicId),
	])
	const liveUrls = new Set([...links.map(({ url }) => url), ...commentLinkUrls])

	// retain the strongest contribution when several senders supplied the same URL
	const personalSourceScoreBonuses = new Map<string, PersonalSourceScoreBonus>()
	for (const link of links) {
		const previousBonus = personalSourceScoreBonuses.get(link.url) ?? 0
		if (link.personalSourceScoreBonus > previousBonus) {
			personalSourceScoreBonuses.set(link.url, link.personalSourceScoreBonus)
		}
	}

	// a shared comment's link counts as a deliberate send
	for (const commentLinkUrl of commentLinkUrls) {
		personalSourceScoreBonuses.set(commentLinkUrl, PERSONAL_SOURCE_SCORE_BONUS)
	}
	return {
		claimedUrls: liveUrls,
		discoveredResources: discoveredResources.filter(
			(resource) => !resource.isFromPersonalSources || liveUrls.has(resource.url),
		),
		personalSourceScoreBonuses,
	}
}
