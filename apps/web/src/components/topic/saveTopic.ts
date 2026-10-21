import { sendTopicPodcast } from "@carlnotes/client/podcastEpisodeClient"
import {
	DailyTopicLimitError,
	sendAttachmentContext,
	sendCreateTopic,
	sendDeleteAttachment,
	sendUpdateTopic,
	uploadTopicAttachment,
} from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { UseNavigateResult } from "@tanstack/react-router"
import { toast } from "sonner"
import { sendPendingUsernameInvites } from "@/components/invite/InviteEditor"
import { toSeePlansToastAction } from "@/lib/toastActions"
import type { TopicTeamField } from "./TopicTeamSelect"
import { type TopicFields, toUpdateTopicPayload } from "./useTopicFields"

// the topic being edited, the id a failed Save already created, the editable fields, and the topic's team
type SaveTopicOptions = {
	topic: TopicResponse | undefined
	// the id a failed Save already created, which the retry updates
	createdTopicId: { current: string | null }
	fields: TopicFields
	topicTeam: TopicTeamField
}

/**
 * Creates or updates the topic, then uploads the new files, sends the attachment edits, and sends the attachment
 * removals. Returns the saved topic's id. Throws only if the save itself fails, and shows lesser failures as toasts.
 */
export async function saveTopic({ topic, createdTopicId, fields, topicTeam }: SaveTopicOptions): Promise<string> {
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

	// save the podcast switch if it changed and show a toast if it did not save
	if (topic?.podcast && fields.isPodcastEnabled !== topic.podcast.isEnabled) {
		const isTopicPodcastSaved = await sendTopicPodcast({ topicId: topic.id, isPodcastEnabled: fields.isPodcastEnabled })
		if (!isTopicPodcastSaved) {
			toast.error("The podcast switch didn't save. Carl suggests trying again.")
		}
	}

	// upload the new attachment files one at a time, dropping each from the pending list as it uploads
	for (const file of [...fields.pendingFiles]) {
		await uploadTopicAttachment(topicId, file)
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

	// a private topic keeps no team and names no followers
	if (fields.visibility !== "private") {
		await sendPendingUsernameInvites(topicId, fields.usernameInvites).catch((error) => {
			console.error("username invites failed", error)
			toast.error("The topic saved, but its invitations didn't go out.")
		})
		// the team change, after the invites
		await topicTeam.assignTopicTeam(topicId).catch((error) => {
			console.error("team change failed", error)
			toast.error("The topic saved, but the team change didn't hold.")
		})
	}
	return topicId
}

// what the toast shows for each required field a save click found empty
export const MISSING_FIELD_NOTES = {
	name: "Please give the topic a title.",
	prompt: "Please write Carl's prompt first.",
	team: "Pick a team, create one, or set Visibility to private.",
} as const

/**
 * Shows a toast that tells the user why a topic save failed.
 */
export function showSaveError(error: unknown, navigate: UseNavigateResult<string>): void {
	if (error instanceof DailyTopicLimitError) {
		toast.error(`${error.message}\n Move a topic to weekly, or get a bigger pot.`, {
			action: toSeePlansToastAction(navigate),
		})
		return
	}
	toast.error(error instanceof Error ? error.message : "Save failed. Carl suggests trying again.")
}
