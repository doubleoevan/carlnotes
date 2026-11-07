// the activity a notifications email reads: who reacted to, commented on, replied to, or mentioned each recipient
import type { REACTION_TYPE_LABELS } from "@carlnotes/contracts/social"
import { db, isFindingShown } from "@carlnotes/db"
import { toNoUserBlockBetweenFilter } from "@carlnotes/db/contentFilters"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { commentMentions, comments, reactions } from "@carlnotes/db/schema/social"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { type NamedTopic, namedTopicColumns } from "@carlnotes/db/topicPermissions"
import type { NotificationsEmailItem } from "@carlnotes/emails/notifications-email"
import { and, type Column, eq, gt, inArray, isNull, ne, type SQL, sql } from "drizzle-orm"
import { alias, type PgSelect } from "drizzle-orm/pg-core"

// the author of a reaction or a comment, joined from the users table, and the comment a reaction or a reply is on
const authors = alias(users, "authors")
const targetComments = alias(comments, "target_comments")

// one thing that happened to a recipient: who did it and when, their words, and the Topic it was on
export type NotificationsEmailRow = {
	recipientUserId: string
	kind: NotificationsEmailItem["kind"]
	authorUsername: string
	reactionType: keyof typeof REACTION_TYPE_LABELS | null
	text: string | null
	createdAt: Date
	// the Topic, and the Finding or the Podcast Episode on it that the activity names, if it names one
	topic: NamedTopic
	findingId: string | null
	findingTitle: string | null
	// the publish time gates the Podcast Episode behind a subscription's activation
	podcastEpisode: {
		id: string
		title: string | null
		season: number | null
		episodeNumber: number | null
		publishedAt: Date | null
	} | null
}

// the columns every activity read selects of the Topic and of the Finding or Podcast Episode on it
const emailTargetColumns = {
	topic: namedTopicColumns,
	findingId: findings.id,
	findingTitle: sql<string | null>`coalesce(${resources.title}, ${resources.url})`,
	podcastEpisode: {
		id: podcastEpisodes.id,
		title: podcastEpisodes.title,
		season: podcastEpisodes.season,
		episodeNumber: podcastEpisodes.episodeNumber,
		publishedAt: podcastEpisodes.publishedAt,
	},
}

// the columns of a read of reactions, and of a read of comments
const reactionEmailColumns = {
	authorUsername: authors.username,
	reactionType: reactions.reactionType,
	createdAt: reactions.createdAt,
	...emailTargetColumns,
}
const commentEmailColumns = {
	authorUsername: authors.username,
	text: comments.body,
	createdAt: comments.createdAt,
	...emailTargetColumns,
}

/**
 * Loads the reactions and comments other people left on each recipient's Topics, Findings, and published Podcast
 * Episodes, the reactions and replies to their comments, and the comments that mention them, all since a time, by
 * authors under no admin block and with no user block between them and the recipient.
 */
export async function loadNotificationsEmailRows(
	since: Date,
	recipientUserIds: string[],
): Promise<NotificationsEmailRow[]> {
	const [reactionRows, commentRows, mentionRows, commentReactionRows, replyRows] = await Promise.all([
		withEmailTarget(
			db
				.select({ recipientUserId: topics.ownerId, ...reactionEmailColumns })
				.from(reactions)
				.$dynamic(),
			reactions,
			reactions.userId,
		).where(
			and(
				gt(reactions.createdAt, since),
				inArray(topics.ownerId, recipientUserIds),
				ne(reactions.userId, topics.ownerId),
				toShownEmailRowFilter(topics.ownerId, reactions.userId),
			),
		),
		withEmailTarget(
			db
				.select({ recipientUserId: topics.ownerId, ...commentEmailColumns })
				.from(comments)
				.$dynamic(),
			comments,
			comments.authorUserId,
		).where(
			and(
				gt(comments.createdAt, since),
				inArray(topics.ownerId, recipientUserIds),
				ne(authors.id, topics.ownerId),
				toShownEmailRowFilter(topics.ownerId, authors.id),
			),
		),
		// a mention of the Topic's owner is already in their comments, and nobody mentions themself
		withEmailTarget(
			db
				.select({ recipientUserId: commentMentions.mentionedUserId, ...commentEmailColumns })
				.from(commentMentions)
				.innerJoin(comments, eq(comments.id, commentMentions.commentId))
				.$dynamic(),
			comments,
			comments.authorUserId,
		).where(
			and(
				gt(comments.createdAt, since),
				inArray(commentMentions.mentionedUserId, recipientUserIds),
				ne(authors.id, commentMentions.mentionedUserId),
				ne(commentMentions.mentionedUserId, topics.ownerId),
				toShownEmailRowFilter(commentMentions.mentionedUserId, authors.id),
			),
		),
		// a reaction to a comment goes to the comment's author
		withEmailTarget(
			db
				.select({ recipientUserId: sql<string>`${targetComments.authorUserId}`, ...reactionEmailColumns })
				.from(reactions)
				.innerJoin(targetComments, eq(targetComments.id, reactions.commentId))
				.$dynamic(),
			targetComments,
			reactions.userId,
		).where(
			and(
				gt(reactions.createdAt, since),
				inArray(targetComments.authorUserId, recipientUserIds),
				ne(reactions.userId, targetComments.authorUserId),
				toShownEmailRowFilter(targetComments.authorUserId, reactions.userId),
			),
		),
		// a reply goes to the author of the comment it answers. the Topic's owner already reads it as a comment
		withEmailTarget(
			db
				.select({ recipientUserId: sql<string>`${targetComments.authorUserId}`, ...commentEmailColumns })
				.from(comments)
				.innerJoin(targetComments, eq(targetComments.id, comments.parentCommentId))
				.$dynamic(),
			comments,
			comments.authorUserId,
		).where(
			and(
				gt(comments.createdAt, since),
				inArray(targetComments.authorUserId, recipientUserIds),
				ne(authors.id, targetComments.authorUserId),
				ne(targetComments.authorUserId, topics.ownerId),
				toShownEmailRowFilter(targetComments.authorUserId, authors.id),
			),
		),
	])
	return [
		...reactionRows.map((reactionRow) => ({ ...reactionRow, kind: "reaction" as const, text: null })),
		...commentReactionRows.map((reactionRow) => ({ ...reactionRow, kind: "commentReaction" as const, text: null })),
		...replyRows.map((replyRow) => ({ ...replyRow, kind: "reply" as const, reactionType: null })),
		...commentRows.map((commentRow) => ({ ...commentRow, kind: "comment" as const, reactionType: null })),
		...mentionRows.map((mentionRow) => ({ ...mentionRow, kind: "mention" as const, reactionType: null })),
	]
}

// an activity read joined to its author, under no admin block, and to what the row hangs on: a Topic, or a Finding or
// a Podcast Episode of one
function withEmailTarget<ActivityQuery extends PgSelect>(
	activityQuery: ActivityQuery,
	targetRow: { findingId: Column; podcastEpisodeId: Column; topicId: Column },
	authorUserId: Column,
): ActivityQuery {
	return activityQuery
		.innerJoin(authors, and(eq(authors.id, authorUserId), isNull(authors.adminBlockedAt)))
		.leftJoin(findings, eq(findings.id, targetRow.findingId))
		.leftJoin(resources, eq(resources.id, findings.resourceId))
		.leftJoin(podcastEpisodes, eq(podcastEpisodes.id, targetRow.podcastEpisodeId))
		.innerJoin(
			topics,
			sql`${topics.id} = coalesce(${targetRow.topicId}, ${findings.topicId}, ${podcastEpisodes.topicId})`,
		) as unknown as ActivityQuery
}

// activity the recipient may read: on a Finding that is shown or a published Podcast Episode, with no user block
// between them and the author
function toShownEmailRowFilter(recipientUserId: Column, authorUserId: Column): SQL | undefined {
	return and(
		isFindingShown,
		sql`(${podcastEpisodes.id} is null or ${podcastEpisodes.status} = 'published')`,
		toNoUserBlockBetweenFilter(recipientUserId, authorUserId),
	)
}
