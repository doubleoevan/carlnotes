// a Topic's Topic Posts: the rows a card and a page read, who may read and write one, a save at the version its editor
// opened at, and the publish and delete writes

import { toReactionCount } from "@carlnotes/contracts/home"
import { toTopicPostPath } from "@carlnotes/contracts/seo"
import { SOCIAL_EDIT_MS, type SocialTarget, toSocialTargetKey } from "@carlnotes/contracts/social"
import {
	type ImageRegenerationQuota,
	toTopicImageUrlsOrNull,
	toTopicPostImageUrls,
} from "@carlnotes/contracts/topicImages"
import type { TopicPostCard, TopicPostResponse } from "@carlnotes/contracts/topicPosts"
// the tables, the gate, and the readers the rows join
import { db } from "@carlnotes/db"
import { releaseHomeOrder } from "@carlnotes/db/homeOrder"
import { releaseTopicPostProfileOrder } from "@carlnotes/db/profileOrder"
import { loadDiscussionRegenerationQuota } from "@carlnotes/db/quotas"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { recordPendingObjectDeletions } from "@carlnotes/db/store"
import { isImageReportedByUser } from "@carlnotes/db/topicImages"
import { namedTopicColumns } from "@carlnotes/db/topicPermissions"
import { clearUnseenCommentMentions, loadTopicPostMentionedUserIds } from "@carlnotes/db/unseenCommentMentions"
import { and, asc, desc, eq, inArray, isNotNull, isNull, type SQL, sql } from "drizzle-orm"
// the gate, the author's identity, and the reactions
import { isAllowed } from "../authorization"
import { toProfileIdentity } from "../avatars"
import { loadTopicCounts } from "../counts/viewerCounts"
import { loadPageCommentThread } from "../social/pageCommentThread"
import { loadReactionSummaries, loadReactionSummary } from "../social/reactionRows"
import { loadEditorImageRegenerationQuota } from "../topic/imageEdits"
import { loadTopicPostDiscussion } from "./topicPostDiscussions"
import { loadTopicPostObjectKeys } from "./topicPostObjectKeys"

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

/**
 * Returns whether the user may read a Topic Post. A draft is its author's alone, and a published one is read by
 * whoever may open its Topic.
 */
export async function canReadTopicPost(userId: string | null, topicPostRow: TopicPostRow): Promise<boolean> {
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
 * Returns whether a published Topic Post is still inside its author's edit time, which an edit does not extend. A
 * draft is edited freely.
 */
export function isTopicPostEditable(topicPost: { publishedAt: Date | null }, now = new Date()): boolean {
	return !topicPost.publishedAt || now.getTime() - topicPost.publishedAt.getTime() <= SOCIAL_EDIT_MS
}

/**
 * Returns a Topic Post's page for one reader: its card, its body, its reactions, and what the reader may do with it.
 * A read of a published post adds the first page of its comment thread.
 */
export async function toTopicPostResponse(
	userId: string | null,
	topicPostRow: TopicPostRow,
	{ isCommentThreadIncluded = false }: { isCommentThreadIncluded?: boolean } = {},
): Promise<TopicPostResponse> {
	// the caller's part in the post: its author, its Topic's owner, an admin, or an editor of its Topic
	const { topicPost, topic } = topicPostRow
	const isAuthor = userId !== null && topicPost.authorUserId === userId
	const isTopicOwner = userId !== null && topic.ownerId === userId
	const [isAdmin, canPublish, canEditImage, isImageReported, discussion, reactions, commentThread, topicCountsResult] =
		await Promise.all([
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
		html: topicPost.html,
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
		isEditable: isAuthor && isTopicPostEditable(topicPost),
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

// what a save writes: the post, its cleaned title and body, the body's word count, and the version its editor opened at
type SaveTopicPostOptions = {
	topicPost: Pick<TopicPostRow["topicPost"], "id" | "publishedAt">
	title: string
	html: string
	wordCount: number
	version: number
}

/**
 * Writes a Topic Post's title and body at the version its editor opened at, in one conditional statement with no
 * lock. Returns the new version, or the stored one if a newer save holds the post.
 */
export async function saveTopicPost({
	topicPost,
	title,
	html,
	wordCount,
	version,
}: SaveTopicPostOptions): Promise<{ status: "saved" | "conflict"; version: number }> {
	// the write holds only while the stored version is the one the editor opened at, and a draft's write only while
	// the post is still a draft. a published post notes its edit
	const isDraftFilter = topicPost.publishedAt ? undefined : isNull(topicPosts.publishedAt)
	const [savedRow] = await db
		.update(topicPosts)
		.set({
			title,
			html,
			wordCount,
			// the next version, and the edit's time on a published post
			version: sql`${topicPosts.version} + 1`,
			...(topicPost.publishedAt ? { editedAt: new Date() } : {}),
		})
		.where(and(eq(topicPosts.id, topicPost.id), eq(topicPosts.version, version), isDraftFilter))
		.returning({ version: topicPosts.version })
	if (savedRow) {
		return { status: "saved", version: savedRow.version }
	}

	// the version moved, so name the stored one
	const [storedRow] = await db
		.select({ version: topicPosts.version })
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPost.id))
	return { status: "conflict", version: storedRow?.version ?? version }
}

/**
 * Publishes a draft at the version that was checked, and returns whether this request published it. A post that is
 * already published, or that was saved again since, stays as it is.
 */
export async function publishTopicPost(topicPostId: string, version: number): Promise<boolean> {
	const publishedRows = await db
		.update(topicPosts)
		.set({ publishedAt: new Date() })
		.where(and(eq(topicPosts.id, topicPostId), eq(topicPosts.version, version), isNull(topicPosts.publishedAt)))
		.returning({ id: topicPosts.id })
	return publishedRows.length > 0
}

/**
 * Creates a draft on a Topic for its author and returns its id.
 */
export async function createTopicPostDraft(topicId: string, authorUserId: string): Promise<string> {
	const [createdRow] = await db.insert(topicPosts).values({ topicId, authorUserId }).returning({ id: topicPosts.id })
	if (!createdRow) {
		throw new Error("the topic post draft was not created")
	}
	return createdRow.id
}

/**
 * Deletes a Topic Post, which takes its Comments, its reactions, and its discussions with it, and schedules its image's
 * files and its discussions' audio for deletion. A pinned post leaves the home's pins and its author's profile pins,
 * and each user its Comments mention reads their unseen Comment Mentions again.
 */
export async function deleteTopicPost(topicPostId: string): Promise<void> {
	// the users that the post's Comments mention, read while the Comments exist
	const mentionedUserIds = await loadTopicPostMentionedUserIds(topicPostId)
	await db.transaction(async (transaction) => {
		// the keys first. the delete takes the rows that name them
		const objectKeys = await loadTopicPostObjectKeys({ topicPostId }, transaction)

		// close the gap a pinned post leaves in each order, then delete the row
		await releaseHomeOrder({ table: topicPosts, id: topicPostId, handle: transaction })
		await releaseTopicPostProfileOrder(topicPostId, transaction)
		await transaction.delete(topicPosts).where(eq(topicPosts.id, topicPostId))
		await recordPendingObjectDeletions({ handle: transaction, objectKeys, nextTryAt: new Date() })
	})

	// the deleted Comments' mentions leave each mentioned user's cached read
	await clearUnseenCommentMentions(mentionedUserIds)
}
