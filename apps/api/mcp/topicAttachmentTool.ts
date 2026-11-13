// the add_topic_attachment tool: a page by its url, or pasted text with a title, added to a topic its owner names
// through the url attachment route's own add
import { z } from "zod"
import { type AddTopicAttachmentResult, addTopicAttachment, type TopicAttachmentAdd } from "../topic/attachmentWrites"
import { type RegisterToolsOptions, topicIdArgument, toTextResult } from "./toolShapes"
import { toTopicWriteCall } from "./topicEditTools"

// what add_topic_attachment takes: the topic, and a url or a title with its text
const addTopicAttachmentPayload = z.object({
	topic_id: topicIdArgument,
	url: z.string().trim().min(1).max(2000).optional().describe("A public page to read and attach."),
	// pasted text, which its title names
	title: z.string().trim().min(1).max(120).optional().describe("The title of the pasted text."),
	text: z.string().trim().min(1).max(200_000).optional().describe("Text to attach, with a title, in place of a url."),
})

// the result text of each way an attachment is not added
const ADD_TOPIC_ATTACHMENT_REJECTION_TEXTS = {
	missingInput: "Give a url, or a title and its text. Nothing was added.",
	forbidden: "Only the topic's owner adds an attachment. Nothing was added.",
	failed: "Carl couldn't process that attachment. Try again in a moment.",
} as const

/**
 * Registers add_topic_attachment.
 */
export function registerTopicAttachmentTool({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"add_topic_attachment",
		{
			title: "Add an attachment",
			description:
				"Add an attachment to a CarlNotes topic you own: the page at a public url, or pasted text with a title, saved as a plain-text file. Carl reads it in the background, and every brew after that scores findings with it. Use it when the user asks Carl or CarlNotes to attach something to a topic, with phrases like attach this page, attach this to the topic, or save this text to the topic.",
			inputSchema: addTopicAttachmentPayload,
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		},
		async ({ topic_id, url, title, text }) => {
			const topicWriteCall = toTopicWriteCall({ toolCaller, routeTopicId, topicId: topic_id })
			if ("rejectionResult" in topicWriteCall) {
				return topicWriteCall.rejectionResult
			}

			// a url, or a title with its text
			const topicAttachmentAdd = toTopicAttachmentAdd({ url, title, text })
			if (!topicAttachmentAdd) {
				return toTextResult(ADD_TOPIC_ATTACHMENT_REJECTION_TEXTS.missingInput, true)
			}

			// the owner's add, through the route's own ingest
			const addTopicAttachmentResult = await addTopicAttachment({ ...topicWriteCall, topicAttachmentAdd })
			return toTextResult(
				toAddTopicAttachmentText(addTopicAttachmentResult),
				addTopicAttachmentResult.status !== "added",
			)
		},
	)
}

// the one add the arguments name: a url alone, or a title and text with no url
function toTopicAttachmentAdd({
	url,
	title,
	text,
}: {
	url: string | undefined
	title: string | undefined
	text: string | undefined
}): TopicAttachmentAdd | null {
	// a url with no text reads the page, and text needs its title
	if (url && !text) {
		return { kind: "url", url }
	}
	return !url && title && text ? { kind: "text", title, text } : null
}

// the line an add's result reads as
function toAddTopicAttachmentText(addTopicAttachmentResult: AddTopicAttachmentResult): string {
	switch (addTopicAttachmentResult.status) {
		case "added":
			return `Added ${addTopicAttachmentResult.filename}. Carl reads it in the background.`
		case "invalid":
			return `${addTopicAttachmentResult.reason}. Nothing was added.`
		// the owner check and an internal failure
		case "forbidden":
		case "failed":
			return ADD_TOPIC_ATTACHMENT_REJECTION_TEXTS[addTopicAttachmentResult.status]
	}
}
