// counting the viewers of a Topic Post's page, and reading its count for the page
import type { ViewerCounts } from "@carlnotes/contracts/viewerCounts"
import { addDailyView } from "@carlnotes/db/dailyCountBuffer"
import { addViewer } from "@carlnotes/db/viewerCounts"
import type { RequestSender } from "@carlnotes/server/viewerElements"
import { type CountsResult, readViewerCount, toCountedElement } from "../counts/viewerCounts"
import { canReadTopicPost, loadTopicPostAccessRow } from "./topicPosts"

/**
 * Counts a view of a Topic Post's page, if the sender may read the post. A crawler, a link unfurler, a visitor with no
 * address, and a Redis failure all count nothing.
 */
export async function countTopicPostView(requestSender: RequestSender, topicPostId: string): Promise<void> {
	const element = toCountedElement(requestSender)
	if (!element) {
		return
	}

	// count only a view of a Topic Post the sender may read
	const topicPostAccessRow = await loadTopicPostAccessRow(topicPostId)
	if (topicPostAccessRow && (await canReadTopicPost(requestSender.userId, topicPostAccessRow))) {
		await Promise.all([
			addViewer({ kind: "topicPost", id: topicPostId }, element),
			addDailyView({ itemKind: "topicPost", itemId: topicPostId, element, place: requestSender.place }),
		])
	}
}

/**
 * Reads a Topic Post's viewers for someone who may read it, or null.
 */
export async function loadTopicPostViewerCounts(
	userId: string | null,
	topicPostId: string,
): Promise<CountsResult<ViewerCounts> | null> {
	const topicPostAccessRow = await loadTopicPostAccessRow(topicPostId)
	if (!topicPostAccessRow || !(await canReadTopicPost(userId, topicPostAccessRow))) {
		return null
	}

	// the larger of the live estimate and the saved column, and whether the Topic Post's Topic is public
	const viewerCount = await readViewerCount(
		{ kind: "topicPost", id: topicPostId },
		topicPostAccessRow.topicPost.viewerCount,
	)
	return { counts: { viewerCount }, isPublic: topicPostAccessRow.topic.visibility === "public" }
}
