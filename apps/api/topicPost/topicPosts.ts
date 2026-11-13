// a Topic's Topic Posts as they read: the rows a card and a page read, and who may read and write one

import { toReactionCount } from "@carlnotes/contracts/home"
import { toTopicPostPath } from "@carlnotes/contracts/seo"
import { type SocialTarget, toSocialTargetKey } from "@carlnotes/contracts/social"
import {
	type ImageRegenerationQuota,
	toTopicImageUrlsOrNull,
	toTopicPostImageUrls,
} from "@carlnotes/contracts/topicImages"
import { TOPIC_POST_BODY_IMAGES_PATH } from "@carlnotes/contracts/topicPostBodyImages"
import type { TopicPostCard, TopicPostResponse } from "@carlnotes/contracts/topicPosts"
// the tables, the gate, and the readers the rows join
import { db } from "@carlnotes/db"
import { loadDiscussionRegenerationQuota } from "@carlnotes/db/quotas"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { isImageReportedByUser } from "@carlnotes/db/topicImages"
import { namedTopicColumns } from "@carlnotes/db/topicPermissions"
import { and, asc, desc, eq, inArray, isNotNull, isNull, type SQL, sql } from "drizzle-orm"
// the gate, the author's identity, and the reactions
import { isAllowed } from "../authorization"
import { toProfileIdentity } from "../avatars"
import { loadTopicCounts } from "../counts/viewerCounts"
import { loadPageCommentThread } from "../social/pageCommentThread"
import { loadReactionSummaries, loadReactionSummary } from "../social/reactionRows"
import { loadEditorImageRegenerationQuota } from "../topic/imageEdits"
import {
	isTopicPostPublic,
	loadTopicPostHtmlWithoutReportedImages,
	toTopicPostHtmlForReader,
} from "./topicPostBodyImages"
import { loadTopicPostDiscussion } from "./topicPostDiscussions"

// what a Topic Post's read joins: the post, its Topic's gate columns, name, and image, and its author's identity
const topicPostRowColumns = {
	topicPost: topicPosts,
	topic: { ...namedTopicColumns, imageHash: topics.imageHash },
	author: { userId: users.id, username: users.username, avatarSource: users.avatarSource, avatarKey: users.avatarKey },
}

// a Topic Post with its Topic and its author
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
export type TopicPostCardRow = Omit<TopicPostRow, "topicPost"> & {
	topicPost: Pick<TopicPostRow["topicPost"], keyof typeof topicPostCardColumns>
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
	// the post, its Topic, and its author in one read
	const [topicPostRow] = await db
		.select(topicPostRowColumns)
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.innerJoin(users, eq(users.id, topicPosts.authorUserId))
		.where(eq(topicPosts.id, topicPostId))
	return topicPostRow ?? null
}

// what a read check needs of a Topic Post: whether it is published, its author, and its Topic
export type TopicPostAccessRow = {
	topicPost: Pick<TopicPostRow["topicPost"], "publishedAt" | "authorUserId">
	topic: TopicPostRow["topic"]
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
	// a draft is listed for its author alone
	const isOwnDraft = userId ? and(isNull(topicPosts.publishedAt), eq(topicPosts.authorUserId, userId)) : sql`false`

	// the drafts sort first. a draft has no published time
	const topicPostRows = await toTopicPostCardRowQuery()
		.where(and(eq(topicPosts.topicId, topicId), sql`(${isNotNull(topicPosts.publishedAt)} or ${isOwnDraft})`))
		.orderBy(sql`${topicPosts.publishedAt} desc nulls first`, desc(topicPosts.updatedAt))
	// each post as its card
	return toTopicPostCards(topicPostRows)
}

/**
 * Loads the published Topic Posts a filter keeps, in a profile's order: the pinned ones by their position, the newest
 * first among those at one position, then the rest newest first.
 */
export function loadProfileOrderTopicPostRows(topicPostFilter: SQL | undefined): Promise<TopicPostCardRow[]> {
	// the published posts with their Topics and authors, the pinned ones first
	return toTopicPostCardRowQuery()
		.where(and(isNotNull(topicPosts.publishedAt), topicPostFilter))
		.orderBy(sql`${topicPosts.profileOrder} is null`, asc(topicPosts.profileOrder), desc(topicPosts.publishedAt))
}

/**
 * Loads the Topic Posts' cards in the ids' order.
 */
export async function loadTopicPostCardsById(topicPostIds: string[]): Promise<TopicPostCard[]> {
	if (topicPostIds.length === 0) {
		return []
	}

	// the posts with their Topics and authors
	const topicPostRows = await toTopicPostCardRowQuery().where(inArray(topicPosts.id, topicPostIds))

	// each row by its id, so the cards follow the ids
	const topicPostRowById = new Map(topicPostRows.map((topicPostRow) => [topicPostRow.topicPost.id, topicPostRow]))
	return toTopicPostCards(topicPostIds.flatMap((topicPostId) => topicPostRowById.get(topicPostId) ?? []))
}

/**
 * Returns the rows as cards in the rows' order, each with its reaction count, read for all of them at once.
 */
export async function toTopicPostCards(topicPostRows: TopicPostCardRow[]): Promise<TopicPostCard[]> {
	// the reactions on the posts, in one read. a draft has none
	const reactionSummaries = await loadReactionSummaries({
		userId: null,
		targets: topicPostRows.map(({ topicPost }) => toTopicPostTarget(topicPost.id)),
	})

	// each row as its card
	return topicPostRows.map((topicPostRow) => {
		const reactionSummary = reactionSummaries.get(toSocialTargetKey(toTopicPostTarget(topicPostRow.topicPost.id)))
		return toTopicPostCard(topicPostRow, reactionSummary ? toReactionCount(reactionSummary) : 0)
	})
}

// a Topic Post as the social target its reactions and Comments hang on
function toTopicPostTarget(topicPostId: string): SocialTarget {
	return { kind: "post", id: topicPostId }
}

// a Topic Post as its card shows it, with how many reactions it has
function toTopicPostCard({ topicPost, topic, author }: TopicPostCardRow, reactionCount: number): TopicPostCard {
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

// what a Topic Post's page adds: the first page of its comment thread, and the site's origin before each body image's
// path, for a reader that loads the images from another origin
type TopicPostResponseOptions = { isCommentThreadIncluded?: boolean; siteUrl?: string }

/**
 * Returns a Topic Post's page for one reader: its card, its body, its reactions, and what the reader may do with it.
 * A read of a published post adds the first page of its comment thread.
 */
export async function toTopicPostResponse(
	userId: string | null,
	topicPostRow: TopicPostRow,
	{ isCommentThreadIncluded = false, siteUrl }: TopicPostResponseOptions = {},
): Promise<TopicPostResponse> {
	// the caller's part in the post: its author, its Topic's owner, an admin, or an editor of its Topic
	const { topicPost, topic } = topicPostRow
	const isAuthor = userId !== null && topicPost.authorUserId === userId
	const isTopicOwner = userId !== null && topic.ownerId === userId
	const [
		isAdmin,
		canPublish,
		canEditImage,
		isImageReported,
		discussion,
		reactions,
		commentThread,
		topicCountsResult,
		readerHtml,
	] = await Promise.all([
		isAllowed(userId, "admin:console"),
		isAllowed(userId, "topicPost:publish", topic),
		canEditTopicPostImage(userId, topicPostRow),
		isTopicPostImageReported(userId, topicPost),
		topicPost.publishedAt ? loadTopicPostDiscussion(topicPost.id) : null,
		loadReactionSummary(userId, toTopicPostTarget(topicPost.id)),
		// a draft has no thread
		isCommentThreadIncluded && topicPost.publishedAt
			? loadPageCommentThread({ userId, topic, target: { kind: "post", id: topicPost.id } })
			: undefined,
		// the Topic's viewers and subscribers, as its own page reads them
		loadTopicCounts(userId, topic.id),
		// the body without the images the reader reported
		loadTopicPostHtmlWithoutReportedImages(userId, topicPostRow),
	])

	// whoever may change the image reads their regenerations this month, where it came from, and its image prompt
	const imageRegenerationQuota = canEditImage && userId ? await loadEditorImageRegenerationQuota(userId) : null

	// whoever may publish on the Topic reads their discussion regenerations this month
	const discussionRegenerationQuota = canPublish ? await loadShownDiscussionRegenerationQuota(userId) : null

	// the card, the body at its version, and what the caller may do
	const topicPostCard = toTopicPostCard(topicPostRow, toReactionCount(reactions))
	return {
		...topicPostCard,
		image: isImageReported ? null : topicPostCard.image,
		html: toTopicPostHtmlForReader(readerHtml, { isSigned: !isTopicPostPublic(topicPostRow), siteUrl }),
		version: topicPost.version,
		editedAt: topicPost.editedAt?.toISOString() ?? null,
		isTopicPublic: topic.visibility === "public",
		topicVisibility: topic.visibility,
		topicImage: toTopicImageUrlsOrNull(topic.id, topic.imageHash),
		topicCounts: topicCountsResult?.counts,
		reactions,
		commentThread,
		// what the caller may do
		isTopicOwner,
		isAuthor,
		isEditable: isAuthor,
		canDelete: isAuthor || isAdmin || isTopicOwner,
		discussion,
		discussionRegenerationQuota,
		canEditImage,
		imageRegenerationQuota,
		imageOrigin: canEditImage ? topicPost.imageOrigin : null,
		imagePrompt: canEditImage ? topicPost.imagePrompt : null,
		canPublish,
	}
}

// the discussion regenerations a user has used this month and their limit, the two counts a regenerate control reads
async function loadShownDiscussionRegenerationQuota(userId: string | null): Promise<ImageRegenerationQuota | null> {
	if (!userId) {
		return null
	}
	const { used, limit } = await loadDiscussionRegenerationQuota(userId)
	return { used, limit }
}

// whether the reader reported the post's image since it last changed. a reader who did no longer sees it until it
// changes
async function isTopicPostImageReported(
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
