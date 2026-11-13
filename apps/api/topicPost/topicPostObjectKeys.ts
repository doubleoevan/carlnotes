// the stored objects of Topic Posts: each post's image files, its body images' files, and each of its discussions' audio

import { TOPIC_POST_BODY_IMAGES_PATH, toTopicPostBodyImageIds } from "@carlnotes/contracts/topicPostBodyImages"
import { type DbHandle, db } from "@carlnotes/db"
import { topicPostDiscussions, topicPosts } from "@carlnotes/db/schema/topicPosts"
import { toTopicPostImageObjectKeys } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { toTopicPostBodyImageObjectKeys } from "@carlnotes/pipeline/topicPosts/topicPostBodyImageFiles"
import { and, eq, isNotNull, like, or, type SQL, sql } from "drizzle-orm"

// whose Topic Posts: one post, every post on a Topic, or every post an author wrote
export type TopicPostObjectKeyFilter = { topicPostId: string } | { topicId: string } | { authorUserId: string }

/**
 * Returns the object keys of the Topic Posts a filter names: their image files, the files of the body images their saved
 * bodies show, and their discussions' audio. An upload no body shows is already pending deletion.
 */
export async function loadTopicPostObjectKeys(
	filter: TopicPostObjectKeyFilter,
	handle: DbHandle = db,
): Promise<string[]> {
	// the posts that have an image or a body image, with the body of a post with a body image alone, and the
	// discussions of the posts that still have audio
	const isTopicPostNamed = toTopicPostCondition(filter)
	const hasBodyImage = like(topicPosts.html, `%${TOPIC_POST_BODY_IMAGES_PATH}/%`)
	const bodyImageHtml = sql<string | null>`case when ${hasBodyImage} then ${topicPosts.html} end`
	const [topicPostImageRows, discussionAudioRows] = await Promise.all([
		handle
			.select({ id: topicPosts.id, imageHash: topicPosts.imageHash, html: bodyImageHtml })
			.from(topicPosts)
			.where(and(isTopicPostNamed, or(isNotNull(topicPosts.imageHash), hasBodyImage))),
		handle
			.select({ audioKey: topicPostDiscussions.audioKey })
			.from(topicPostDiscussions)
			.innerJoin(topicPosts, eq(topicPosts.id, topicPostDiscussions.topicPostId))
			.where(and(isTopicPostNamed, isNotNull(topicPostDiscussions.audioKey))),
	])

	// each image's files, each body image's files, then each recording's audio
	return [
		...topicPostImageRows.flatMap((topicPostRow) =>
			topicPostRow.imageHash ? toTopicPostImageObjectKeys(topicPostRow.id, topicPostRow.imageHash) : [],
		),
		...topicPostImageRows.flatMap((topicPostRow) =>
			toTopicPostBodyImageIds(topicPostRow.html ?? "", topicPostRow.id).flatMap((imageId) =>
				toTopicPostBodyImageObjectKeys(topicPostRow.id, imageId),
			),
		),
		...discussionAudioRows.flatMap((discussionRow) => (discussionRow.audioKey ? [discussionRow.audioKey] : [])),
	]
}

// the condition on the posts table that a filter names
function toTopicPostCondition(filter: TopicPostObjectKeyFilter): SQL {
	// one post, then a topic's posts, then an author's
	if ("topicPostId" in filter) {
		return eq(topicPosts.id, filter.topicPostId)
	}
	if ("topicId" in filter) {
		return eq(topicPosts.topicId, filter.topicId)
	}
	return eq(topicPosts.authorUserId, filter.authorUserId)
}
