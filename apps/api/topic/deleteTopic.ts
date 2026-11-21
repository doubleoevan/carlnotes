// deleting a topic: every row it owns goes in one transaction with its object keys recorded, then the objects

import { toTopicPath } from "@carlnotes/contracts/seo"
import { type DbHandle, db } from "@carlnotes/db"
import { releaseTopicProfileOrders } from "@carlnotes/db/profileOrder"
import { chatRoomAttachments } from "@carlnotes/db/schema/chat"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topicImages } from "@carlnotes/db/schema/topicImages"
import { attachments, topics } from "@carlnotes/db/schema/topics"
import { deleteStoredObjects, recordPendingObjectDeletions, toStoredObjectKeys } from "@carlnotes/db/store"
import { clearUnseenCommentMentions, loadTopicMentionedUserIds } from "@carlnotes/db/unseenCommentMentions"
import { loadVisitorPagesOfTopic } from "@carlnotes/db/visitorPageCaches"
import { rebuildTopicDashboards } from "@carlnotes/pipeline/dashboardRebuild"
import { notifyIndexNow } from "@carlnotes/pipeline/indexNow"
import { loadTopicPodcastEpisodeObjectKeys } from "@carlnotes/pipeline/podcast/removePodcastEpisode"
import {
	toPodcastEpisodeImageObjectKeys,
	toTopicImageObjectKeys,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { trackEvent } from "@carlnotes/server/analytics"
import { appUrl } from "@carlnotes/server/appUrl"
import { and, eq, isNotNull } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { loadChatAttachmentObjectKeys } from "../chat/chatAttachmentReads"
import type { AnalyticsProperties } from "../currentUser"
import { loadTopicPostObjectKeys } from "../topicPost/topicPostObjectKeys"
import { clearVisitorTopicCaches } from "./feedCaches"
import { releaseHomeOrder } from "./homeOrder"

/**
 * Deletes a topic and everything it includes. Only allowed by an owner or admin.
 */
export async function deleteTopic(
	userId: string,
	topicId: string,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	// authorize the delete through the access gate: owner, or admin
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:delete", topic))) {
		return false
	}

	// the users that the topic's comments mention, and the copies of every page that shows the topic, read while the
	// rows exist
	const mentionedUserIds = await loadTopicMentionedUserIds(topicId)
	const visitorPagesOfTopic = await loadVisitorPagesOfTopic(topicId)

	// record every stored object's key and delete the topic in one transaction, so the keys survive the cascade to the
	// sources, findings, invites, subscriptions, and attachment rows. a scan and a podcast episode keep their rows
	let isHomeOrderReleased = false
	let releasedProfileUserIds: string[] = []
	const objectKeys = await db.transaction(async (transaction) => {
		const topicObjectKeys = await loadTopicObjectKeys(topicId, transaction)
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: topicObjectKeys })
		// the topic and its podcast episodes leave the home's featured items and their owner's featured profile items
		isHomeOrderReleased = await releaseHomeOrder(topicId, transaction)
		releasedProfileUserIds = await releaseTopicProfileOrders(topicId, transaction)
		await transaction.delete(topics).where(eq(topics.id, topicId))
		return topicObjectKeys
	})

	// clear the topic's cached visitor copies, which purges its pages and image files from the edge, and the cached
	// unseen Comment Mentions that its comments held once the rows are gone, then delete the objects and rebuild the
	// topic's Dashboards
	await clearVisitorTopicCaches({
		topicId,
		ownerId: topic.ownerId,
		visibility: topic.visibility,
		isDeleted: true,
		isHomeOrderReleased,
		releasedProfileUserIds,
		visitorPagesOfTopic,
	})
	await clearUnseenCommentMentions(mentionedUserIds)
	await deleteStoredObjects(objectKeys)
	await rebuildTopicDashboards(topic)

	// a deleted public topic's url is gone, so notify IndexNow to drop it
	if (topic.visibility === "public") {
		void notifyIndexNow([`${appUrl()}${toTopicPath(topic)}`])
	}

	// record who deleted the topic. the row is gone, so this event is the only account of who deleted it
	trackEvent("topic_deleted", userId, { ...analyticsProperties, topicId, isTopicOwner: topic.ownerId === userId })
	return true
}

// the keys of every stored object a topic holds: its attachments, its chat attachments, its chat rooms' shared files,
// its podcast episodes' audio, chapter audio, and images, its own image, and its Topic Posts' images and discussion
// audio
async function loadTopicObjectKeys(topicId: string, handle: DbHandle): Promise<string[]> {
	const [
		attachmentRows,
		chatAttachmentObjectKeys,
		chatRoomAttachmentRows,
		podcastEpisodeObjectKeys,
		podcastEpisodeImageRows,
		topicImageRows,
		topicPostObjectKeys,
	] = await Promise.all([
		handle.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.topicId, topicId)),
		loadChatAttachmentObjectKeys({ topicId }, handle),
		handle
			.select({ objectKey: chatRoomAttachments.objectKey })
			.from(chatRoomAttachments)
			.where(eq(chatRoomAttachments.topicId, topicId)),
		loadTopicPodcastEpisodeObjectKeys(topicId, handle),
		handle
			.select({ id: podcastEpisodes.id, imageHash: podcastEpisodes.imageHash })
			.from(podcastEpisodes)
			.where(and(eq(podcastEpisodes.topicId, topicId), isNotNull(podcastEpisodes.imageHash))),
		handle.select({ hash: topicImages.hash }).from(topicImages).where(eq(topicImages.topicId, topicId)),
		loadTopicPostObjectKeys({ topicId }, handle),
	])
	return [
		...toStoredObjectKeys(attachmentRows),
		...chatAttachmentObjectKeys,
		...toStoredObjectKeys(chatRoomAttachmentRows),
		...podcastEpisodeObjectKeys,
		...podcastEpisodeImageRows.flatMap((episodeRow) =>
			episodeRow.imageHash ? toPodcastEpisodeImageObjectKeys(episodeRow.id, episodeRow.imageHash) : [],
		),
		...topicImageRows.flatMap((imageRow) => toTopicImageObjectKeys(topicId, imageRow.hash)),
		...topicPostObjectKeys,
	]
}
