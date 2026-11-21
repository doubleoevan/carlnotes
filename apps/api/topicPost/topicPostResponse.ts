// a Topic Post's page for one reader: its card, its body, its reactions, its discussion, and what the reader may do

import { toReactionCount } from "@carlnotes/contracts/home"
import { type ImageRegenerationQuota, toTopicImageUrlsOrNull } from "@carlnotes/contracts/topicImages"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { loadDiscussionRegenerationQuota } from "@carlnotes/db/quotas"
import { isAllowed } from "../authorization"
import { toTopicCountsFromRow } from "../counts/viewerCounts"
import { loadPageCommentThread } from "../social/pageCommentThread"
import { loadReactionSummary } from "../social/reactionRows"
import { loadEditorImageRegenerationQuota } from "../topic/imageEdits"
import {
	isTopicPostPublic,
	loadTopicPostHtmlWithoutReportedImages,
	toTopicPostHtmlForReader,
} from "./topicPostBodyImages"
import { loadTopicPostDiscussion } from "./topicPostDiscussions"
import {
	canEditTopicPostImage,
	isTopicPostImageReported,
	type TopicPostRow,
	toTopicPostCard,
	toTopicPostTarget,
} from "./topicPosts"

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
		// the Topic's viewers and subscribers, as its own page reads them, from the counts the post's row includes
		toTopicCountsFromRow(userId, { ...topic, ...topicPostRow.topicCounts }),
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
		viewerCount: topicPost.viewerCount,
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
