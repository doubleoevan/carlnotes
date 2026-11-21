// the own group's candidate ids: the Topic Posts, Comments, and reactions in a news window that start from the
// person's Topics, Topic Posts, and Comments, read through indexes

import { db } from "@carlnotes/db"
import { comments, reactions } from "@carlnotes/db/schema/social"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { and, type Column, eq, gt, inArray, lte, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { LoadNewsEventRowsOptions } from "./newsEventRows"

// the rows the own group's candidate id reads range over, and the person's own Comments and Topic Posts they start from
const candidateComments = alias(comments, "candidate_comments")
const candidateReactions = alias(reactions, "candidate_reactions")
const candidateTopicPosts = alias(topicPosts, "candidate_topic_posts")
const personComments = alias(comments, "person_comments")
const personTopicPosts = alias(topicPosts, "person_topic_posts")

// a time column's rows inside the window
export function toWindowFilter(timeColumn: Column, { since, until }: LoadNewsEventRowsOptions): SQL | undefined {
	return and(gt(timeColumn, since), lte(timeColumn, until))
}

// the own group's filter of an arm to the ids that its candidate reads find through indexes inside the window, starting
// from the person's Topics, Topic Posts, and Comments. the arm's own filter still decides each row, so the rows stay
// the same and the arm never walks the window's rows of every Topic. a later group's Topic filter is already a range
// read of its Topics, so it gets no filter
export function toOwnCandidateFilter(
	idColumn: Column,
	options: LoadNewsEventRowsOptions,
	toCandidateIdReads: (options: LoadNewsEventRowsOptions) => SQLWrapper[],
): SQL | undefined {
	if (options.group !== "own") {
		return undefined
	}
	return sql`${idColumn} in (${sql.join(toCandidateIdReads(options), sql` union all `)})`
}

// the own group's Topics as a list of reads: one read on them, or none if the person has no Topic the reader may open
function toOwnTopicReads(
	{ topicIds }: LoadNewsEventRowsOptions,
	toTopicRead: (ownTopicIds: string[]) => SQLWrapper,
): SQLWrapper[] {
	return topicIds.own.length > 0 ? [toTopicRead(topicIds.own)] : []
}

// the ids of the person's own Comments and of their own Topic Posts
function toPersonCommentIds({ profileUserId }: LoadNewsEventRowsOptions): SQLWrapper {
	return db.select({ id: personComments.id }).from(personComments).where(eq(personComments.authorUserId, profileUserId))
}

// the ids of the person's own Topic Posts
function toPersonTopicPostIds({ profileUserId }: LoadNewsEventRowsOptions): SQLWrapper {
	return db
		.select({ id: personTopicPosts.id })
		.from(personTopicPosts)
		.where(eq(personTopicPosts.authorUserId, profileUserId))
}

// the Topic Posts published in the window by the person and on the own group's Topics
export function toTopicPostCandidateIdReads(options: LoadNewsEventRowsOptions): SQLWrapper[] {
	const toIdRead = (filter: SQL): SQLWrapper =>
		db
			.select({ id: candidateTopicPosts.id })
			.from(candidateTopicPosts)
			.where(and(filter, toWindowFilter(candidateTopicPosts.publishedAt, options)))
	return [
		toIdRead(eq(candidateTopicPosts.authorUserId, options.profileUserId)),
		...toOwnTopicReads(options, (ownTopicIds) => toIdRead(inArray(candidateTopicPosts.topicId, ownTopicIds))),
	]
}

// the Comments posted in the window that reply to the person's Comments, that are on their Topic Posts, and that are
// on the own group's Topics
export function toCommentCandidateIdReads(options: LoadNewsEventRowsOptions): SQLWrapper[] {
	const toIdRead = (filter: SQL): SQLWrapper =>
		db
			.select({ id: candidateComments.id })
			.from(candidateComments)
			.where(and(filter, toWindowFilter(candidateComments.createdAt, options)))
	return [
		toIdRead(inArray(candidateComments.parentCommentId, toPersonCommentIds(options))),
		toIdRead(inArray(candidateComments.postId, toPersonTopicPostIds(options))),
		...toOwnTopicReads(options, (ownTopicIds) => toIdRead(inArray(candidateComments.targetTopicId, ownTopicIds))),
	]
}

// the reactions saved in the window on the person's Topic Posts and on the own group's Topics
export function toReactionCandidateIdReads(options: LoadNewsEventRowsOptions): SQLWrapper[] {
	return [
		toReactionIdRead(inArray(candidateReactions.postId, toPersonTopicPostIds(options)), options),
		...toOwnTopicReads(options, (ownTopicIds) =>
			toReactionIdRead(inArray(candidateReactions.targetTopicId, ownTopicIds), options),
		),
	]
}

// the reactions saved in the window on the person's Comments and on the own group's Topics. the reactions on one
// Comment all hold its Topic, so either read finds every reaction a Comment's count reads
export function toCommentReactionCandidateIdReads(options: LoadNewsEventRowsOptions): SQLWrapper[] {
	return [
		toReactionIdRead(inArray(candidateReactions.commentId, toPersonCommentIds(options)), options),
		...toOwnTopicReads(options, (ownTopicIds) =>
			toReactionIdRead(inArray(candidateReactions.targetTopicId, ownTopicIds), options),
		),
	]
}

// the ids of the reactions saved in the window that a filter keeps
function toReactionIdRead(filter: SQL, options: LoadNewsEventRowsOptions): SQLWrapper {
	return db
		.select({ id: candidateReactions.id })
		.from(candidateReactions)
		.where(and(filter, toWindowFilter(candidateReactions.createdAt, options)))
}
