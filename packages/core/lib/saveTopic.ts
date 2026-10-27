import { sendTopicPodcast } from "@carlnotes/client/podcastEpisodeClient"
import {
	sendAttachmentContext,
	sendCreateTopic,
	sendDeleteAttachment,
	sendUpdateTopic,
} from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { type TopicFields, toUpdateTopicPayload } from "../hooks/useTopicFields"
import type { TopicTeamField } from "../hooks/useTopicTeamChoice"

// the topic being edited, the id a failed Save already created, the editable fields, and the topic's team
export type SaveTopicOptions<Attachment> = {
	topic: TopicResponse | undefined
	// the id a failed Save already created, which the retry updates
	createdTopicId: { current: string | null }
	fields: TopicFields<Attachment>
	topicTeam: Pick<TopicTeamField, "assignTopicTeam">
	uploadAttachment: (topicId: string, file: Attachment) => Promise<void>
	sendUsernameInvites: (topicId: string, usernames: string[]) => Promise<void>
	onWarning: (message: string) => void
}

/**
 * Saves the Topic and its dependent writes, retaining completed work for retry and reporting optional failures through onWarning.
 */
export async function saveTopic<Attachment>({
	topic,
	createdTopicId,
	fields,
	topicTeam,
	uploadAttachment,
	sendUsernameInvites,
	onWarning,
}: SaveTopicOptions<Attachment>): Promise<string> {
	// the payload, and the id of an existing or already created topic
	const payload = toUpdateTopicPayload(fields)
	const existingTopicId = topic?.id ?? createdTopicId.current
	// an existing or already created topic updates in place. a new one is created and yields its id
	let topicId: string
	if (existingTopicId) {
		await sendUpdateTopic(existingTopicId, payload)
		topicId = existingTopicId
	} else {
		topicId = await sendCreateTopic(payload)
		createdTopicId.current = topicId
	}

	// save the podcast switch if it changed and report a warning if it did not save
	if (topic?.podcast && fields.isPodcastEnabled !== topic.podcast.isEnabled) {
		const isTopicPodcastSaved = await sendTopicPodcast({ topicId: topic.id, isPodcastEnabled: fields.isPodcastEnabled })
		if (!isTopicPodcastSaved) {
			onWarning("The podcast switch didn't save. Carl suggests trying again.")
		}
	}

	// upload the new attachment files one at a time, dropping each from the pending list as it uploads
	for (const file of [...fields.pendingFiles]) {
		await uploadAttachment(topicId, file)
		fields.setPendingFiles((current) => current.filter((pending) => pending !== file))
	}

	// update every attachment whose context the owner edited, for the next topic scan
	const editedAttachments = fields.keptAttachments.filter((attachment) => {
		const loadedAttachment = topic?.attachments.find((loaded) => loaded.id === attachment.id)
		return loadedAttachment !== undefined && attachment.context !== loadedAttachment.context
	})
	for (const attachment of editedAttachments) {
		await sendAttachmentContext(attachment.id, attachment.context ?? "")
	}

	// best-effort attachment removals. the reloaded page shows whatever truly remains
	const keptAttachmentIds = new Set(fields.keptAttachments.map((attachment) => attachment.id))
	const removedAttachments = (topic?.attachments ?? []).filter((attachment) => !keptAttachmentIds.has(attachment.id))
	await Promise.all(
		removedAttachments.map((attachment) =>
			sendDeleteAttachment(attachment.id).catch((error) => console.error("attachment delete failed", error)),
		),
	)

	// send invitations and assign teams only for a non-private topic
	if (fields.visibility !== "private") {
		await sendUsernameInvites(topicId, fields.usernameInvites).catch((error) => {
			console.error("username invites failed", error)
			onWarning("The topic saved, but its invitations didn't go out.")
		})
		// the team change, after the invites
		await topicTeam.assignTopicTeam(topicId)
	}
	return topicId
}

// the feedback for each missing required field
export const MISSING_FIELD_NOTES = {
	name: "Please give the topic a title.",
	prompt: "Please write Carl's prompt first.",
	team: "Pick a team, create one, or set Visibility to private.",
} as const
