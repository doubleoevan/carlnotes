// what resolving a report does to its subject as the admin. Remove and Block delete a chat room message, a note, a note
// comment, or a comment, draw a reported image again, and take a body image out of its post. Remove alone resets a
// reported avatar and draws a reported podcast episode's images again. an image drawn again also drops an unchecked
// upload for it, so the sweep never publishes that upload over the new image
import type { ReportedSubjectQuery } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { replaceAvatar, replaceTeamAvatar } from "@carlnotes/db/avatars"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import { noteComments, notes } from "@carlnotes/db/schema/notes"
import {
	regenerateRemovedPodcastEpisodeImage,
	regenerateRemovedTopicImage,
	regenerateRemovedTopicPodcastEpisodeVideoImage,
	regenerateRemovedTopicPostImage,
} from "@carlnotes/pipeline/topicImages/removedImageUploads"
import { dropUncheckedImage } from "@carlnotes/pipeline/uncheckedImages"
import { purgeEdgeCacheTagAfterDeletion } from "@carlnotes/server/edgePurge"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { deleteChatRoomMessage } from "../chat/roomDeletes"
import { toTeamAvatarCacheTag, toUserAvatarCacheTag } from "../edgeCache"
import { deleteNoteComment } from "../note/noteComments"
import { deleteCommentThread } from "../social/comments"
import { removeReportedTopicPostBodyImage } from "../topicPost/topicPostBodyImageReports"

// what removing needs: the admin's request context and id, and the subject's kind and id
type RemoveReportedSubjectOptions = ReportedSubjectQuery & { context: Context; adminUserId: string }

/**
 * Deletes a reported chat room message, note, note comment, or comment as the admin, draws a reported image again, or
 * takes a reported body image out of its post. Content that is already gone is skipped.
 */
export async function removeReportedSubject({
	context,
	adminUserId,
	subjectKind,
	subjectId,
}: RemoveReportedSubjectOptions): Promise<void> {
	if (subjectKind === "chatMessage") {
		// the room's own delete takes the chat room message's files and mentions with it. the admin branch of its gate
		// allows it
		const numericChatMessageId = Number(subjectId)
		const [chatRoomMessage] = Number.isSafeInteger(numericChatMessageId)
			? await db.select().from(chatRoomMessages).where(eq(chatRoomMessages.id, numericChatMessageId))
			: []
		// a chat room message already gone leaves nothing to delete
		if (chatRoomMessage) {
			await deleteChatRoomMessage(context, adminUserId, chatRoomMessage)
		}
		return
	}
	// the note delete takes its comments and reads with it
	if (subjectKind === "note") {
		await db.delete(notes).where(eq(notes.id, subjectId))
		return
	}

	// the comment's note id comes from the row, and the admin branch deletes anyone's comment
	if (subjectKind === "noteComment") {
		const [noteComment] = await db
			.select({ noteId: noteComments.noteId })
			.from(noteComments)
			.where(eq(noteComments.id, subjectId))
		// a comment already gone leaves nothing to delete
		if (noteComment) {
			await deleteNoteComment({ noteCommentId: subjectId, noteId: noteComment.noteId, authorUserId: null })
		}
		return
	}

	// a comment is deleted for everyone, as its Topic's owner would delete it, with its mentions' cached reads cleared
	if (subjectKind === "comment") {
		await deleteCommentThread(subjectId)
		return
	}

	// a topic's image and a topic post's are drawn again, and an unchecked upload for either is dropped
	if (subjectKind === "topicImage") {
		await dropUncheckedImage({ subjectKind: "topicImage", subjectId }, null)
		await regenerateRemovedTopicImage(subjectId)
	}
	if (subjectKind === "topicPostImage") {
		await dropUncheckedImage({ subjectKind: "topicPostImage", subjectId }, null)
		await regenerateRemovedTopicPostImage(subjectId)
	}

	// a body image is taken out of its post's body
	if (subjectKind === "topicPostBodyImage") {
		await removeReportedTopicPostBodyImage(subjectId)
	}
}

/**
 * Resets a reported profile's or team's avatar and purges it from the edge, or draws a reported podcast episode's
 * image again, with its film's image if that one is an upload. A report of any other kind changes nothing.
 */
export async function removeReportedSubjectImages({ subjectKind, subjectId }: ReportedSubjectQuery): Promise<void> {
	// a profile's user returns to the generated avatar, and their stored upload and an unchecked upload for them are
	// deleted
	if (subjectKind === "profile") {
		await replaceAvatar(subjectId, "generated", null)
		await purgeEdgeCacheTagAfterDeletion(toUserAvatarCacheTag(subjectId))
	}

	// a team is left with no avatar, and its stored upload and an unchecked upload for it are deleted
	if (subjectKind === "team") {
		await replaceTeamAvatar(subjectId, null)
		await purgeEdgeCacheTagAfterDeletion(toTeamAvatarCacheTag(subjectId))
	}

	// a podcast episode's image is drawn again on the platform's budget, and its film's uploaded image with it. an
	// unchecked upload for either is dropped first
	if (subjectKind === "podcastEpisode") {
		await dropUncheckedImage({ subjectKind: "podcastEpisodeImage", subjectId }, null)
		await dropUncheckedImage({ subjectKind: "topicPodcastEpisodeVideoImage", subjectId }, null)
		await regenerateRemovedPodcastEpisodeImage(subjectId)
		await regenerateRemovedTopicPodcastEpisodeVideoImage(subjectId)
	}
}
