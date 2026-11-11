// the stored objects of Topic Posts: each post's image files and each of its discussions' audio

import { type DbHandle, db } from "@carlnotes/db"
import { topicPostDiscussions, topicPosts } from "@carlnotes/db/schema/topicPosts"
import { toTopicPostImageObjectKeys } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { and, eq, isNotNull, type SQL } from "drizzle-orm"

// whose Topic Posts: one post, every post on a Topic, or every post an author wrote
export type TopicPostObjectKeyFilter = { topicPostId: string } | { topicId: string } | { authorUserId: string }

/**
 * Returns the object keys of the Topic Posts a filter names: their image files and their discussions' audio. A delete
 * reads them on its own transaction before the rows go.
 */
export async function loadTopicPostObjectKeys(
	filter: TopicPostObjectKeyFilter,
	handle: DbHandle = db,
): Promise<string[]> {
	// the posts that have an image, and the discussions of the posts that still have audio
	const isTopicPostNamed = toTopicPostCondition(filter)
	const [topicPostImageRows, discussionAudioRows] = await Promise.all([
		handle
			.select({ id: topicPosts.id, imageHash: topicPosts.imageHash })
			.from(topicPosts)
			.where(and(isTopicPostNamed, isNotNull(topicPosts.imageHash))),
		handle
			.select({ audioKey: topicPostDiscussions.audioKey })
			.from(topicPostDiscussions)
			.innerJoin(topicPosts, eq(topicPosts.id, topicPostDiscussions.topicPostId))
			.where(and(isTopicPostNamed, isNotNull(topicPostDiscussions.audioKey))),
	])

	// each image's files, then each recording's audio
	return [
		...topicPostImageRows.flatMap((topicPostRow) =>
			topicPostRow.imageHash ? toTopicPostImageObjectKeys(topicPostRow.id, topicPostRow.imageHash) : [],
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
