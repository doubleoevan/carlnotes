// deleting a topic: every row it owns goes in one transaction with its object keys recorded, then the objects
import { trackEvent } from "@shared/analytics"
import { appUrl } from "@shared/appUrl"
import { toTopicPath } from "@shared/seo"
import { eq } from "drizzle-orm"
import { type DbHandle, db } from "../../db"
import { chatRoomAttachments } from "../../db/schema/chat"
import { attachments, topics } from "../../db/schema/topics"
import {
	deleteStoredObjects,
	loadTopicPodcastEpisodeAudioKeys,
	notifyIndexNow,
	recordPendingObjectDeletions,
	toStoredObjectKeys,
} from "../../worker"
import { isAllowed } from "../authorization"
import { loadChatAttachmentObjectKeys } from "../chat/chatAttachmentReads"
import type { AnalyticsProperties } from "../currentUser"
import { releaseFeatureOrder } from "./featuring"
import { clearVisitorTopicCaches } from "./feeds"

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
	let isFeatureOrderReleased = false
	const objectKeys = await db.transaction(async (transaction) => {
		const topicObjectKeys = await loadTopicObjectKeys(topicId, transaction)
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: topicObjectKeys })
		isFeatureOrderReleased = await releaseFeatureOrder(topicId, transaction)
		await transaction.delete(topics).where(eq(topics.id, topicId))
		return topicObjectKeys
	})

	// delete the objects once the rows are gone, then the topic's cached visitor page, and the visitors' feeds if the
	// topic was public or featured
	await deleteStoredObjects(objectKeys)
	await clearVisitorTopicCaches({
		topicId,
		isListingChanged: isFeatureOrderReleased || topic.visibility === "public",
	})

	// a deleted public topic's url is gone, so notify IndexNow to drop it
	if (topic.visibility === "public") {
		void notifyIndexNow([`${appUrl()}${toTopicPath(topic)}`])
	}

	// record who deleted the topic. the row is gone, so this event is the only account of who deleted it
	trackEvent("topic_deleted", userId, { ...analyticsProperties, topicId, isTopicOwner: topic.ownerId === userId })
	return true
}

// the keys of every stored object a topic holds: its attachments, its chat attachments, its chat rooms' shared files,
// and its podcast episodes' audio and chapter audio
async function loadTopicObjectKeys(topicId: string, handle: DbHandle): Promise<string[]> {
	const [attachmentRows, chatAttachmentObjectKeys, chatRoomAttachmentRows, podcastEpisodeObjectKeys] =
		await Promise.all([
			handle.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.topicId, topicId)),
			loadChatAttachmentObjectKeys({ topicId }, handle),
			handle
				.select({ objectKey: chatRoomAttachments.objectKey })
				.from(chatRoomAttachments)
				.where(eq(chatRoomAttachments.topicId, topicId)),
			loadTopicPodcastEpisodeAudioKeys(topicId, handle),
		])
	return [
		...toStoredObjectKeys(attachmentRows),
		...chatAttachmentObjectKeys,
		...toStoredObjectKeys(chatRoomAttachmentRows),
		...podcastEpisodeObjectKeys,
	]
}
