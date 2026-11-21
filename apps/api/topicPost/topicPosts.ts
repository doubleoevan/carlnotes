// a Topic's Topic Posts as they read: the rows a card and a page read, the cards, and who may read and write one

import { CARDS_PAGE_SIZE } from "@carlnotes/contracts/cardPages"
import { toReactionCount } from "@carlnotes/contracts/home"
import { toTopicPostPath } from "@carlnotes/contracts/seo"
import { type ReactionSummary, type SocialTarget, toSocialTargetKey } from "@carlnotes/contracts/social"
import { toTopicPostImageUrls } from "@carlnotes/contracts/topicImages"
import { TOPIC_POST_BODY_IMAGES_PATH } from "@carlnotes/contracts/topicPostBodyImages"
import type { TopicPostCard, TopicPostCardsPage } from "@carlnotes/contracts/topicPosts"
// the tables, the gate, and the readers the rows join
import { db } from "@carlnotes/db"
import { memoizeRowsById } from "@carlnotes/db/requestMemo"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { isImageReportedByUser } from "@carlnotes/db/topicImages"
import { namedTopicColumns } from "@carlnotes/db/topicPermissions"
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, type SQL, sql } from "drizzle-orm"
// the gate, the author's identity, and the reactions
import { isAllowed } from "../authorization"
import { toProfileIdentity } from "../avatars"
import { loadReactionSummaries } from "../social/reactionRows"

// what a Topic Post's read joins: the post, its Topic's gate columns, name, and image, and its author's identity
const topicPostRowColumns = {
	topicPost: topicPosts,
	topic: { ...namedTopicColumns, imageHash: topics.imageHash },
	author: { userId: users.id, username: users.username, avatarSource: users.avatarSource, avatarKey: users.avatarKey },
}

// what one Topic Post's read joins beyond a card's: its author's provider photo, which the post's card and head draw,
// and its Topic's saved counts, which the post's page shows
const topicPostPageRowColumns = {
	...topicPostRowColumns,
	author: { ...topicPostRowColumns.author, image: users.image },
	topicCounts: { viewerCount: topics.viewerCount, subscriberCount: topics.subscriberCount },
}

// a Topic Post with its Topic, its author, and its Topic's saved counts
export type TopicPostRow = Awaited<ReturnType<typeof loadTopicPostRow>> & {}

// the Topic Post columns a card and a list read, without the body and the image prompt
const topicPostCardColumns = {
	id: topicPosts.id,
	title: topicPosts.title,
	wordCount: topicPosts.wordCount,
	publishedAt: topicPosts.publishedAt,
	summary: topicPosts.summary,
	imageHash: topicPosts.imageHash,
	profileOrder: topicPosts.profileOrder,
}

// what a list of Topic Posts joins: each post's card columns, its Topic, and its author
const topicPostCardRowColumns = { ...topicPostRowColumns, topicPost: topicPostCardColumns }

// a Topic Post as a list reads it, with its Topic and its author
export type TopicPostCardRow = {
	topicPost: Pick<TopicPostRow["topicPost"], keyof typeof topicPostCardColumns>
	topic: TopicPostRow["topic"]
	author: Omit<TopicPostRow["author"], "image">
}

// a read of Topic Post card rows with each post's Topic and author, which a caller filters and orders
// biome-ignore lint/nursery/useExplicitReturnType: the query's type is drizzle's generated builder type
function toTopicPostCardRowQuery() {
	return db
		.select(topicPostCardRowColumns)
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.innerJoin(users, eq(users.id, topicPosts.authorUserId))
}

/**
 * Loads a Topic Post with its Topic and its author, or null for none.
 */
// biome-ignore lint/nursery/useExplicitReturnType: the row's type is the join's generated type, which TopicPostRow names
export async function loadTopicPostRow(topicPostId: string) {
	// the post, its Topic with its saved counts, and its author in one read, once in a request that only reads
	const topicPostRowById = await memoizeRowsById("topic-post-rows", [topicPostId], async () => {
		// the post's row by its id
		const topicPostRows = await db
			.select(topicPostPageRowColumns)
			.from(topicPosts)
			.innerJoin(topics, eq(topics.id, topicPosts.topicId))
			.innerJoin(users, eq(users.id, topicPosts.authorUserId))
			.where(eq(topicPosts.id, topicPostId))
		return new Map(topicPostRows.map((topicPostRow) => [topicPostRow.topicPost.id, topicPostRow]))
	})

	// the post's row, or null for none
	return topicPostRowById.get(topicPostId) ?? null
}

// what a read check needs of a Topic Post: whether it is published, its author, and its Topic
export type TopicPostAccessRow = {
	topicPost: Pick<TopicPostRow["topicPost"], "publishedAt" | "authorUserId">
	topic: TopicPostRow["topic"]
}

/**
 * Loads what a counts read, a view count check, and an image file read of a Topic Post check, without its body:
 * whether it is published, its author, its saved viewer count, its image's hash, and its Topic. Returns null for no
 * such post.
 */
// biome-ignore lint/nursery/useExplicitReturnType: the row's type is the join's generated type
export async function loadTopicPostAccessRow(topicPostId: string) {
	// the post's access columns and its Topic in one read, with no body
	const accessRowColumns = {
		topicPost: {
			publishedAt: topicPosts.publishedAt,
			authorUserId: topicPosts.authorUserId,
			viewerCount: topicPosts.viewerCount,
			imageHash: topicPosts.imageHash,
		},
		topic: topicPostRowColumns.topic,
	}
	const [accessRow] = await db
		.select(accessRowColumns)
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.where(eq(topicPosts.id, topicPostId))
	return accessRow ?? null
}

// what a read of one body image checks, without the post's body
export type TopicPostBodyImageAccessRow = Awaited<ReturnType<typeof loadTopicPostBodyImageAccessRow>> & {}

/**
 * Loads what a read of one body image checks, without the post's body: the post's access columns, its Topic, and
 * whether its saved body names the image by its path.
 */
// biome-ignore lint/nursery/useExplicitReturnType: the row's type is the join's generated type
export async function loadTopicPostBodyImageAccessRow(topicPostId: string, imageId: string) {
	// the post and its Topic in one read, with the body searched in the database for the image's path
	const imagePath = `${TOPIC_POST_BODY_IMAGES_PATH}/${topicPostId}/${imageId}/`
	const [accessRow] = await db
		.select({
			topicPost: { publishedAt: topicPosts.publishedAt, authorUserId: topicPosts.authorUserId },
			topic: topicPostRowColumns.topic,
			isImageSaved: sql<boolean>`position(${imagePath} in ${topicPosts.html}) > 0`,
		})
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.where(eq(topicPosts.id, topicPostId))
	return accessRow ?? null
}

/**
 * Returns whether the user may read a Topic Post. A draft is its author's alone, and a published one is read by
 * whoever may open its Topic.
 */
export async function canReadTopicPost(userId: string | null, topicPostRow: TopicPostAccessRow): Promise<boolean> {
	if (!topicPostRow.topicPost.publishedAt) {
		return topicPostRow.topicPost.authorUserId === userId
	}
	return isAllowed(userId, "topic:view", topicPostRow.topic)
}

/**
 * Loads a Topic's Topic Posts as cards: the user's own drafts first, newest saved first, then the published ones,
 * newest first.
 */
export async function loadTopicPostCards(userId: string | null, topicId: string): Promise<TopicPostCard[]> {
	// the drafts sort first. a draft has no published time
	const topicPostRows = await toTopicPostCardRowQuery()
		.where(toTopicPostListFilter(userId, topicId))
		.orderBy(...TOPIC_POST_LIST_ORDER)
	// each post as its card
	return toTopicPostCards(topicPostRows)
}

/**
 * Loads one zero-based page of a Topic's Topic Posts as cards, in the order of `loadTopicPostCards`, with how many the
 * whole list holds.
 */
export async function loadTopicPostCardsPage(
	userId: string | null,
	topicId: string,
	page: number,
): Promise<TopicPostCardsPage> {
	// the page's rows and the count of every row together
	const topicPostListFilter = toTopicPostListFilter(userId, topicId)
	const [topicPostRows, [countRow]] = await Promise.all([
		toTopicPostCardRowQuery()
			.where(topicPostListFilter)
			.orderBy(...TOPIC_POST_LIST_ORDER)
			.limit(CARDS_PAGE_SIZE)
			.offset(page * CARDS_PAGE_SIZE),
		db.select({ totalCount: count() }).from(topicPosts).where(topicPostListFilter),
	])
	return { topicPosts: await toTopicPostCards(topicPostRows), totalCount: countRow?.totalCount ?? 0 }
}

// the order of a Topic's Topic Posts: the drafts first, newest saved first, then the published ones newest first, with
// the id breaking ties so a page never repeats a post
const TOPIC_POST_LIST_ORDER = [
	sql`${topicPosts.publishedAt} desc nulls first`,
	desc(topicPosts.updatedAt),
	desc(topicPosts.id),
]

// the Topic Posts of a Topic that a list holds: the published ones, and the user's own drafts
function toTopicPostListFilter(userId: string | null, topicId: string): SQL | undefined {
	// a draft is listed for its author alone
	const isOwnDraft = userId ? and(isNull(topicPosts.publishedAt), eq(topicPosts.authorUserId, userId)) : sql`false`
	return and(eq(topicPosts.topicId, topicId), sql`(${isNotNull(topicPosts.publishedAt)} or ${isOwnDraft})`)
}

/**
 * Loads the published Topic Posts a filter keeps, in a profile's order: the featured ones by their position, the newest
 * first among those at one position, then the rest newest first.
 */
export function loadProfileOrderTopicPostRows(topicPostFilter: SQL | undefined): Promise<TopicPostCardRow[]> {
	// the published posts with their Topics and authors, the featured ones first
	return toTopicPostCardRowQuery()
		.where(and(isNotNull(topicPosts.publishedAt), topicPostFilter))
		.orderBy(sql`${topicPosts.profileOrder} is null`, asc(topicPosts.profileOrder), desc(topicPosts.publishedAt))
}

/**
 * Loads the Topic Posts' card rows with their Topics and authors, in the ids' order. A post deleted since its id was
 * read has none.
 */
export async function loadTopicPostCardRowsById(topicPostIds: string[]): Promise<TopicPostCardRow[]> {
	if (topicPostIds.length === 0) {
		return []
	}

	// the posts with their Topics and authors, each by its id, so the rows follow the ids
	const topicPostRows = await toTopicPostCardRowQuery().where(inArray(topicPosts.id, topicPostIds))
	const topicPostRowById = new Map(topicPostRows.map((topicPostRow) => [topicPostRow.topicPost.id, topicPostRow]))
	return topicPostIds.flatMap((topicPostId) => topicPostRowById.get(topicPostId) ?? [])
}

/**
 * Returns the rows as cards in the rows' order, each with its reaction count, read for all of them at once.
 */
export async function toTopicPostCards(topicPostRows: TopicPostCardRow[]): Promise<TopicPostCard[]> {
	// the reactions on the posts, in one read. a draft has none
	const reactionSummaryByTarget = await loadReactionSummaries({
		userId: null,
		targets: topicPostRows.map(({ topicPost }) => toTopicPostTarget(topicPost.id)),
	})
	return toTopicPostCardList(topicPostRows, reactionSummaryByTarget)
}

/**
 * Returns the rows as cards in the rows' order, each with its reaction count from reactions already read.
 */
export function toTopicPostCardList(
	topicPostRows: TopicPostCardRow[],
	reactionSummaryByTarget: Map<string, ReactionSummary>,
): TopicPostCard[] {
	return topicPostRows.map((topicPostRow) => {
		const reactionSummary = reactionSummaryByTarget.get(toSocialTargetKey(toTopicPostTarget(topicPostRow.topicPost.id)))
		return toTopicPostCard(topicPostRow, reactionSummary ? toReactionCount(reactionSummary) : 0)
	})
}

/**
 * Returns a Topic Post as the social target its reactions and Comments hang on.
 */
export function toTopicPostTarget(topicPostId: string): SocialTarget {
	return { kind: "post", id: topicPostId }
}

// a Topic Post as its card shows it, with how many reactions it has
export function toTopicPostCard({ topicPost, topic, author }: TopicPostCardRow, reactionCount: number): TopicPostCard {
	// the inner join always finds the author
	const authorIdentity = toProfileIdentity(author)
	if (!authorIdentity) {
		throw new Error(`topic post ${topicPost.id} has no author`)
	}

	// the card's fields, with the page's path from the Topic's and the post's names
	return {
		id: topicPost.id,
		topicId: topic.id,
		topicName: topic.name,
		title: topicPost.title,
		author: authorIdentity,
		publishedAt: topicPost.publishedAt?.toISOString() ?? null,
		wordCount: topicPost.wordCount,
		// the post's image urls, null until its first render lands
		image: topicPost.imageHash ? toTopicPostImageUrls(topicPost.id, topicPost.imageHash) : null,
		summary: topicPost.summary,
		reactionCount,
		path: toTopicPostPath(topic, topicPost),
	}
}

/**
 * Loads a Topic Post for a write by its author, who must still be one of its Topic's editors. Returns null for anyone
 * else.
 */
export async function loadAuthoredTopicPost(userId: string | null, topicPostId: string): Promise<TopicPostRow | null> {
	const topicPostRow = await loadTopicPostRow(topicPostId)
	if (!userId || !topicPostRow || topicPostRow.topicPost.authorUserId !== userId) {
		return null
	}
	return (await isAllowed(userId, "topicPost:publish", topicPostRow.topic)) ? topicPostRow : null
}

/**
 * Returns whether the user may change a Topic Post's image: its author, and whoever may edit its Topic, while they may
 * still read the post.
 */
export async function canEditTopicPostImage(userId: string | null, topicPostRow: TopicPostRow): Promise<boolean> {
	// a user who may no longer read the post changes nothing of it
	if (userId === null || !(await canReadTopicPost(userId, topicPostRow))) {
		return false
	}
	return topicPostRow.topicPost.authorUserId === userId || isAllowed(userId, "topicPost:editImage", topicPostRow.topic)
}

/**
 * Returns whether the reader reported the post's image since it last changed. A reader who did no longer sees it until
 * it changes.
 */
export async function isTopicPostImageReported(
	userId: string | null,
	topicPost: Pick<TopicPostRow["topicPost"], "id" | "imageHash" | "imageUpdatedAt">,
): Promise<boolean> {
	if (userId === null || topicPost.imageHash === null) {
		return false
	}
	return isImageReportedByUser({
		userId,
		subjectKind: "topicPostImage",
		subjectId: topicPost.id,
		changedAt: topicPost.imageUpdatedAt,
	})
}
