// one group of a person's news as rows: the group's Podcast Episodes, Topic Posts, Comments, reactions, and Findings
// inside a window, read together newest first with the group's row count

import { db, isFindingShown } from "@carlnotes/db"
import { toActivatedAfterFilter, toActivatedScanFilter, toVisibleAuthorFilter } from "@carlnotes/db/contentFilters"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { comments, reactions } from "@carlnotes/db/schema/social"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { toTopicAccessFilter } from "@carlnotes/db/topicPermissions"
import {
	and,
	asc,
	type Column,
	count,
	desc,
	eq,
	exists,
	gt,
	inArray,
	isNotNull,
	isNull,
	lte,
	max,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import { alias, unionAll } from "drizzle-orm/pg-core"
import {
	SOCIAL_TARGET_JOIN_COLUMNS,
	toOpenSocialTargetFilter,
	withSocialTargetJoins,
} from "../social/socialTargetJoins"
import { toNewsEventColumns } from "./newsEventColumns"
import type { NewsGroup, NewsTopicIds } from "./newsTopics"

// who wrote, posted, or reacted, the Comment a reply answers or a reaction is on, and that Comment's author
const actors = alias(users, "actors")
const targetComments = alias(comments, "target_comments")
const commentAuthors = alias(users, "comment_authors")

// one group's read: its place in the news, every group's Topic ids, whose news it is, who reads it, the window, and
// the page
export type LoadNewsEventRowsOptions = {
	group: NewsGroup
	topicIds: NewsTopicIds
	profileUserId: string
	readerUserId: string | null
	// the window's two ends, and the page inside the group
	since: Date
	until: Date
	limit: number
	offset: number
}

// a row of the news as the read returns it, with every row of its group in the window counted
export type NewsEventRow = Awaited<ReturnType<typeof loadNewsEventRows>>[number]

/**
 * Loads one page of one group's news rows, newest first, with rows of one time in the order of their kinds. A group
 * past the first leaves out what the own group holds: the person's Topic Posts, the replies and reactions to their
 * Comments, and the Comments and reactions on their Topic Posts.
 */
// biome-ignore lint/nursery/useExplicitReturnType: the row's type is the union's generated type, which NewsEventRow names
export async function loadNewsEventRows(options: LoadNewsEventRowsOptions) {
	// a group with no Topic holds no row, except the own group, which also reads the person's Comments and Topic Posts
	const { group, topicIds, limit, offset } = options
	if (group !== "own" && topicIds[group].length === 0) {
		return []
	}

	// the five kinds of row, read together
	const newsEvents = db
		.$with("news_events")
		.as(
			unionAll(
				toPodcastEpisodeRows(options),
				toTopicPostRows(options),
				toCommentRows(options),
				toReactionRows(options),
				toCommentReactionRows(options),
				toFindingRows(options),
			),
		)
	return db
		.with(newsEvents)
		.select({
			// the row's kind, record, time, and Topic
			kind: newsEvents.kind,
			id: newsEvents.id,
			occurredAt: newsEvents.occurredAt,
			topicId: newsEvents.topicId,
			topicName: newsEvents.topicName,
			// who did it, the row's title and text, and a reaction's type or count
			actorUserId: newsEvents.actorUserId,
			actorUsername: newsEvents.actorUsername,
			title: newsEvents.title,
			body: newsEvents.body,
			reactionType: newsEvents.reactionType,
			reactionCount: newsEvents.reactionCount,
			// what the row's link opens
			findingId: newsEvents.findingId,
			season: newsEvents.season,
			episodeNumber: newsEvents.episodeNumber,
			topicPostId: newsEvents.topicPostId,
			commentId: newsEvents.commentId,
			commentAuthorUserId: newsEvents.commentAuthorUserId,
			commentAuthorUsername: newsEvents.commentAuthorUsername,
			// the image the row shows: its Podcast Episode's or its published Topic Post's own, or its Topic's
			topicImageHash: newsEvents.topicImageHash,
			topicPostImageHash: newsEvents.topicPostImageHash,
			podcastEpisodeId: newsEvents.podcastEpisodeId,
			podcastEpisodeImageHash: newsEvents.podcastEpisodeImageHash,
			listenerCount: newsEvents.listenerCount,
			// every row of the group in the window
			total: sql<number>`count(*) over ()`.mapWith(Number),
		})
		.from(newsEvents)
		.orderBy(desc(newsEvents.occurredAt), asc(newsEvents.kindRank), asc(newsEvents.id))
		.limit(limit)
		.offset(offset)
}

// a time column's rows inside the window
function toWindowFilter(timeColumn: Column, { since, until }: LoadNewsEventRowsOptions): SQL | undefined {
	return and(gt(timeColumn, since), lte(timeColumn, until))
}

// whether a column's Topic is one of the group's
function toGroupTopicFilter(topicIdColumn: Column, { group, topicIds }: LoadNewsEventRowsOptions): SQL {
	return topicIds[group].length > 0 ? inArray(topicIdColumn, topicIds[group]) : sql`false`
}

// a Comment's or a reaction's place in the group. the own group also holds what hangs on the person's Comments and
// Topic Posts, on any Topic the reader may open, and a later group leaves those rows out
// ponytail: the own group's read is not a Topic range read, so it walks the window's rows of every Topic. split it into
// arms on the author indexes if a week of the site's Comments grows past what one walk reads quickly
function toGroupScopeFilter(
	topicIdColumn: Column,
	isOnPersonTarget: SQL | undefined,
	options: LoadNewsEventRowsOptions,
): SQL | undefined {
	const groupTopicFilter = toGroupTopicFilter(topicIdColumn, options)
	if (options.group !== "own") {
		return and(groupTopicFilter, sql`(${isOnPersonTarget}) is not true`)
	}

	// the person opens what their account may open, and every Topic as an admin. anyone else opens a public Topic
	const { readerUserId, profileUserId } = options
	const isPublicTopic = eq(topics.visibility, "public")
	const isOpenTopic =
		readerUserId === profileUserId
			? or(toTopicAccessFilter(readerUserId), isPublicTopic, toAdminFilter(readerUserId))
			: isPublicTopic
	return or(groupTopicFilter, and(isOnPersonTarget, isOpenTopic))
}

// whether a user is an admin, who may open every Topic
function toAdminFilter(userId: string): SQL {
	return exists(
		db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.id, userId), eq(users.role, "admin"))),
	)
}

// the group's Podcast Episodes published in the window that the reader may listen to
// biome-ignore lint/nursery/useExplicitReturnType: the union needs the query's generated type
function toPodcastEpisodeRows(options: LoadNewsEventRowsOptions) {
	return db
		.select(
			toNewsEventColumns({
				kind: "podcastEpisode",
				id: podcastEpisodes.id,
				occurredAt: podcastEpisodes.publishedAt,
				title: podcastEpisodes.title,
				season: podcastEpisodes.season,
				episodeNumber: podcastEpisodes.episodeNumber,
				podcastEpisodeId: podcastEpisodes.id,
				podcastEpisodeImageHash: podcastEpisodes.imageHash,
				listenerCount: podcastEpisodes.listenerCount,
			}),
		)
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(
			and(
				toGroupTopicFilter(podcastEpisodes.topicId, options),
				eq(podcastEpisodes.status, "published"),
				toWindowFilter(podcastEpisodes.publishedAt, options),
				toActivatedAfterFilter(options.readerUserId, podcastEpisodes.publishedAt),
			),
		)
}

// the group's Topic Posts published in the window, by authors the reader sees. the own group also holds the person's
// own posts on any Topic the reader may open, and a later group leaves those out
// biome-ignore lint/nursery/useExplicitReturnType: the union needs the query's generated type
function toTopicPostRows(options: LoadNewsEventRowsOptions) {
	const isPersonPost = eq(topicPosts.authorUserId, options.profileUserId)
	return db
		.select(
			toNewsEventColumns({
				kind: "topicPost",
				id: topicPosts.id,
				occurredAt: topicPosts.publishedAt,
				actorUserId: actors.id,
				actorUsername: actors.username,
				title: topicPosts.title,
				topicPostId: topicPosts.id,
				topicPostImageHash: topicPosts.imageHash,
			}),
		)
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.innerJoin(actors, eq(actors.id, topicPosts.authorUserId))
		.where(
			and(
				toGroupScopeFilter(topicPosts.topicId, isPersonPost, options),
				toWindowFilter(topicPosts.publishedAt, options),
				toActivatedAfterFilter(options.readerUserId, topicPosts.publishedAt),
				toVisibleAuthorFilter(options.readerUserId, topicPosts.authorUserId),
			),
		)
}

// the group's Comments and replies posted in the window, by authors the reader sees, on what the reader may open
// biome-ignore lint/nursery/useExplicitReturnType: the union needs the query's generated type
function toCommentRows(options: LoadNewsEventRowsOptions) {
	// a reply to the person's Comment and a Comment on their Topic Post belong to the own group
	const isOnPersonTarget = or(
		eq(targetComments.authorUserId, options.profileUserId),
		eq(topicPosts.authorUserId, options.profileUserId),
	)
	return withSocialTargetJoins(
		db
			.select(
				toNewsEventColumns({
					kind: "comment",
					id: comments.id,
					occurredAt: comments.createdAt,
					actorUserId: actors.id,
					actorUsername: actors.username,
					body: comments.body,
					commentId: comments.id,
					...SOCIAL_TARGET_JOIN_COLUMNS,
				}),
			)
			.from(comments)
			.leftJoin(actors, eq(actors.id, comments.authorUserId))
			.leftJoin(targetComments, eq(targetComments.id, comments.parentCommentId))
			.$dynamic(),
		comments,
	).where(
		and(
			toWindowFilter(comments.createdAt, options),
			toGroupScopeFilter(comments.targetTopicId, isOnPersonTarget, options),
			toVisibleAuthorFilter(options.readerUserId, comments.authorUserId),
			toOpenSocialTargetFilter(options.readerUserId),
		),
	)
}

// the group's reactions saved in the window on a Topic, a Finding, a Podcast Episode, or a Topic Post, one row each
// biome-ignore lint/nursery/useExplicitReturnType: the union needs the query's generated type
function toReactionRows(options: LoadNewsEventRowsOptions) {
	// a reaction on the person's Topic Post belongs to the own group
	const isOnPersonTarget = eq(topicPosts.authorUserId, options.profileUserId)
	return withSocialTargetJoins(
		db
			.select(
				toNewsEventColumns({
					kind: "reaction",
					id: reactions.id,
					occurredAt: reactions.createdAt,
					actorUserId: actors.id,
					actorUsername: actors.username,
					reactionType: reactions.reactionType,
					...SOCIAL_TARGET_JOIN_COLUMNS,
				}),
			)
			.from(reactions)
			.innerJoin(actors, eq(actors.id, reactions.userId))
			.$dynamic(),
		reactions,
	).where(
		and(
			isNull(reactions.commentId),
			toWindowFilter(reactions.createdAt, options),
			toGroupScopeFilter(reactions.targetTopicId, isOnPersonTarget, options),
			toVisibleAuthorFilter(options.readerUserId, reactions.userId),
			toOpenSocialTargetFilter(options.readerUserId),
		),
	)
}

// the group's reactions saved in the window on Comments, one row per Comment with their count and the newest time.
// the count leaves out a reaction by a person the reader does not see
// biome-ignore lint/nursery/useExplicitReturnType: the union needs the query's generated type
function toCommentReactionRows(options: LoadNewsEventRowsOptions) {
	// each Comment's reactions in the window. a later group's read is a range read of its Topics
	const commentReactionCounts = db
		.select({
			commentId: reactions.commentId,
			reactionCount: count().as("comment_reaction_count"),
			newestReactedAt: max(reactions.createdAt).as("newest_reacted_at"),
		})
		.from(reactions)
		.where(
			and(
				isNotNull(reactions.commentId),
				toWindowFilter(reactions.createdAt, options),
				options.group === "own" ? undefined : toGroupTopicFilter(reactions.targetTopicId, options),
				toVisibleAuthorFilter(options.readerUserId, reactions.userId),
			),
		)
		.groupBy(reactions.commentId)
		.as("comment_reaction_counts")

	// reactions on the person's Comment belong to the own group
	const isOnPersonTarget = eq(targetComments.authorUserId, options.profileUserId)
	return withSocialTargetJoins(
		db
			.select(
				toNewsEventColumns({
					kind: "reaction",
					id: targetComments.id,
					occurredAt: commentReactionCounts.newestReactedAt,
					reactionCount: commentReactionCounts.reactionCount,
					commentId: targetComments.id,
					commentAuthorUserId: commentAuthors.id,
					commentAuthorUsername: commentAuthors.username,
					...SOCIAL_TARGET_JOIN_COLUMNS,
				}),
			)
			.from(commentReactionCounts)
			.innerJoin(targetComments, eq(targetComments.id, commentReactionCounts.commentId))
			.leftJoin(commentAuthors, eq(commentAuthors.id, targetComments.authorUserId))
			.$dynamic(),
		targetComments,
	).where(
		and(
			toGroupScopeFilter(targetComments.targetTopicId, isOnPersonTarget, options),
			toVisibleAuthorFilter(options.readerUserId, targetComments.authorUserId),
			toOpenSocialTargetFilter(options.readerUserId),
		),
	)
}

// the group's Findings kept in the window that the Topic's Feed shows the reader
// biome-ignore lint/nursery/useExplicitReturnType: the union needs the query's generated type
function toFindingRows(options: LoadNewsEventRowsOptions) {
	return db
		.select(
			toNewsEventColumns({
				kind: "finding",
				id: findings.id,
				occurredAt: findings.createdAt,
				title: sql`coalesce(${resources.title}, ${resources.url})`,
				findingId: findings.id,
			}),
		)
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.innerJoin(scans, eq(scans.id, findings.scanId))
		.innerJoin(topics, eq(topics.id, findings.topicId))
		.where(
			and(
				toGroupTopicFilter(findings.topicId, options),
				toWindowFilter(findings.createdAt, options),
				isFindingShown,
				toActivatedScanFilter(options.readerUserId),
			),
		)
}
