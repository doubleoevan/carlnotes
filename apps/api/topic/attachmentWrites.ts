// a topic attachment added by its owner: a page read from a url, or pasted text stored as a plain-text file
import { ingestAttachment, ingestUrlAttachment } from "@carlnotes/pipeline/attach"
import { AttachmentValidationError } from "@carlnotes/pipeline/attachContentType"
import { trackEvent } from "@carlnotes/server/analytics"
import type { AnalyticsProperties } from "../currentUser"
import { loadOwnedTopic } from "./permissions"

// what the owner adds: a page by its url, or text with the title its file is named by
export type TopicAttachmentAdd = { kind: "url"; url: string } | { kind: "text"; title: string; text: string }

// how an add ends: added, a topic this user does not own, a url or text the ingest rejects, or an internal failure
export type AddTopicAttachmentResult =
	| { status: "added"; attachmentId: string; filename: string }
	| { status: "forbidden" }
	| { status: "invalid"; reason: string }
	| { status: "failed" }

/**
 * Adds an attachment to a topic its owner names, or returns why it was not added. The owner check runs first, so a
 * stranger's url is never fetched.
 */
export async function addTopicAttachment({
	userId,
	topicId,
	topicAttachmentAdd,
	analyticsProperties,
}: {
	userId: string
	topicId: string
	topicAttachmentAdd: TopicAttachmentAdd
	analyticsProperties: AnalyticsProperties
}): Promise<AddTopicAttachmentResult> {
	// only the topic's owner adds an attachment
	if (!(await loadOwnedTopic(userId, topicId))) {
		return { status: "forbidden" }
	}

	// a url's page, or the text as a plain-text file, through the same ingest a file upload takes
	try {
		const attachment =
			topicAttachmentAdd.kind === "url"
				? await ingestUrlAttachment(topicId, topicAttachmentAdd.url)
				: await ingestAttachment({
						topicId,
						filename: `${topicAttachmentAdd.title}.txt`,
						contentType: "text/plain",
						bytes: new TextEncoder().encode(topicAttachmentAdd.text),
					})
		trackEvent("attachment_added", userId, { ...analyticsProperties, topicId, kind: topicAttachmentAdd.kind })
		return { status: "added", attachmentId: attachment.id, filename: attachment.filename }
	} catch (error) {
		// a validation error names the owner's own url or text, so it shows as written. anything else is internal
		if (error instanceof AttachmentValidationError) {
			return { status: "invalid", reason: error.message }
		}
		console.error(`${topicAttachmentAdd.kind} attachment ingestion failed for topic ${topicId}`, error)
		return { status: "failed" }
	}
}
