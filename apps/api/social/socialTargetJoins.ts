// what a Comment or a reaction hangs on, joined to a read of many rows at once: the joins, the columns the row's title
// and link read, and the filter that keeps what the reader may open

import { isFindingShown } from "@carlnotes/db"
import { toActivatedAfterFilter, toActivatedScanFilter } from "@carlnotes/db/contentFilters"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { and, type Column, eq, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm"
import type { PgSelect } from "drizzle-orm/pg-core"

/**
 * The columns of what a Comment or a reaction hangs on: its title, what its link opens, and a Podcast Episode's image.
 */
export const SOCIAL_TARGET_JOIN_COLUMNS = {
	title: sql`coalesce(${resources.title}, ${resources.url}, ${podcastEpisodes.title}, ${topicPosts.title})`,
	findingId: findings.id,
	season: podcastEpisodes.season,
	episodeNumber: podcastEpisodes.episodeNumber,
	topicPostId: topicPosts.id,
	podcastEpisodeId: podcastEpisodes.id,
	podcastEpisodeImageHash: podcastEpisodes.imageHash,
}

// the row a Comment or a reaction hangs on, by its social target columns
type SocialTargetJoinRow = { findingId: Column; podcastEpisodeId: Column; postId: Column; targetTopicId: Column }

/**
 * Joins a read to what its rows hang on: a Finding with its resource and Scan, a Podcast Episode, or a Topic Post, and
 * the Topic of any of them.
 */
export function withSocialTargetJoins<SocialQuery extends PgSelect>(
	socialQuery: SocialQuery,
	targetRow: SocialTargetJoinRow,
): SocialQuery {
	return (
		socialQuery
			.leftJoin(findings, eq(findings.id, targetRow.findingId))
			.leftJoin(resources, eq(resources.id, findings.resourceId))
			.leftJoin(scans, eq(scans.id, findings.scanId))
			.leftJoin(podcastEpisodes, eq(podcastEpisodes.id, targetRow.podcastEpisodeId))
			.leftJoin(topicPosts, eq(topicPosts.id, targetRow.postId))
			// the Topic the row belongs to, which every write sets
			.innerJoin(topics, eq(topics.id, targetRow.targetTopicId)) as unknown as SocialQuery
	)
}

/**
 * Returns the filter that keeps what the reader may open of the rows a Comment or a reaction hangs on: a Finding the
 * Topic's Feed shows them, a published Podcast Episode they may listen to, and a published Topic Post.
 */
export function toOpenSocialTargetFilter(readerUserId: string | null): SQL | undefined {
	return and(
		or(isNull(findings.id), and(isFindingShown, toActivatedScanFilter(readerUserId))),
		or(
			isNull(podcastEpisodes.id),
			and(eq(podcastEpisodes.status, "published"), toActivatedAfterFilter(readerUserId, podcastEpisodes.publishedAt)),
		),
		or(isNull(topicPosts.id), isNotNull(topicPosts.publishedAt)),
	)
}
