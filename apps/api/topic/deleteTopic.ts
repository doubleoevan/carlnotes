// deleting a topic: every row it owns goes in one transaction with its object keys recorded, then the objects

import { toTopicPath } from "@carlnotes/contracts/seo"
import { type DbHandle, db } from "@carlnotes/db"
import { chatRoomAttachments } from "@carlnotes/db/schema/chat"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topicImages } from "@carlnotes/db/schema/topicImages"
import { attachments, topics } from "@carlnotes/db/schema/topics"
import { deleteStoredObjects, recordPendingObjectDeletions, toStoredObjectKeys } from "@carlnotes/db/store"
import { notifyIndexNow } from "@carlnotes/pipeline/indexNow"
import { loadTopicPodcastEpisodeAudioKeys } from "@carlnotes/pipeline/podcast/removePodcastEpisode"
import {
	toPodcastEpisodeImageObjectKeys,
	toTopicImageObjectKeys,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { trackEvent } from "@carlnotes/server/analytics"
import { appUrl } from "@carlnotes/server/appUrl"
import { purgeEdgeCacheTagAfterDeletion, toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import { and, eq, isNotNull } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { loadChatAttachmentObjectKeys } from "../chat/chatAttachmentReads"
import type { AnalyticsProperties } from "../currentUser"
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

	// record every stored object's key and delete the topic in one transaction, so the keys survive the cascade to the
	// sources, findings, invites, subscriptions, and attachment rows. a scan and a podcast episode keep their rows
	let isHomeOrderReleased = false
	const objectKeys = await db.transaction(async (transaction) => {
		const topicObjectKeys = await loadTopicObjectKeys(topicId, transaction)
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: topicObjectKeys })
		isHomeOrderReleased = await releaseHomeOrder(topicId, transaction)
		await transaction.delete(topics).where(eq(topics.id, topicId))
		return topicObjectKeys
	})

	// clear the topic's cached visitor copies once the rows are gone, then delete the objects
	await clearVisitorTopicCaches({ topicId, visibility: topic.visibility, isHomeOrderReleased })
	await deleteStoredObjects(objectKeys)

	// a deleted public topic's url is gone, so notify IndexNow to drop it, and its image files leave the edge
	if (topic.visibility === "public") {
		void notifyIndexNow([`${appUrl()}${toTopicPath(topic)}`])
		await purgeEdgeCacheTagAfterDeletion(toTopicImageCacheTag(topicId))
	}

	// record who deleted the topic. the row is gone, so this event is the only account of who deleted it
	trackEvent("topic_deleted", userId, { ...analyticsProperties, topicId, isTopicOwner: topic.ownerId === userId })
	return true
}

// the keys of every stored object a topic holds: its attachments, its chat attachments, its chat rooms' shared files,
// its podcast episodes' audio, chapter audio, and images, and its own image
async function loadTopicObjectKeys(topicId: string, handle: DbHandle): Promise<string[]> {
	const [
		attachmentRows,
		chatAttachmentObjectKeys,
		chatRoomAttachmentRows,
		podcastEpisodeObjectKeys,
		podcastEpisodeImageRows,
		topicImageRows,
	] = await Promise.all([
		handle.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.topicId, topicId)),
		loadChatAttachmentObjectKeys({ topicId }, handle),
		handle
			.select({ objectKey: chatRoomAttachments.objectKey })
			.from(chatRoomAttachments)
			.where(eq(chatRoomAttachments.topicId, topicId)),
		loadTopicPodcastEpisodeAudioKeys(topicId, handle),
		handle
			.select({ id: podcastEpisodes.id, imageHash: podcastEpisodes.imageHash })
			.from(podcastEpisodes)
			.where(and(eq(podcastEpisodes.topicId, topicId), isNotNull(podcastEpisodes.imageHash))),
		handle.select({ hash: topicImages.hash }).from(topicImages).where(eq(topicImages.topicId, topicId)),
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
	]
}
