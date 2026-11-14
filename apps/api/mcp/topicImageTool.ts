// the set_topic_image tool: a topic's image regenerated from an optional image prompt, or replaced by the image at a
// public url, through the topic image routes' own edits
import { toModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import { toEditableTopicDraft } from "@carlnotes/contracts/topicEdits"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import {
	loadTopicImageEditor,
	regenerateTopicImage,
	setTopicImageFromUrl,
	type TopicImageEditor,
} from "../topic/topicImageEdits"
import { loadTopicPage } from "../topic/topics"
import { type RegisterToolsOptions, topicIdArgument, toStatusResult, toTextResult } from "./toolShapes"
import { toEditableTopicFields } from "./topicEdits"
import { toTopicWriteCall } from "./topicEditTools"
import { toMcpViewToolMeta } from "./uiResources"

// what set_topic_image takes: the topic, and an image url or an optional image prompt for a regenerate
const setTopicImagePayload = z.object({
	topic_id: topicIdArgument,
	image_url: z
		.url()
		.max(2000)
		.optional()
		.describe("A public jpeg, png, or webp to use as the image. Leave it out to regenerate the image."),
	// a regenerate's image prompt, which the url ignores
	image_prompt: z
		.string()
		.trim()
		.min(1)
		.max(500)
		.optional()
		.describe("What the regenerated image shows. Leave it out to regenerate from the topic itself."),
})

// the result text of each way an image is not set
const SET_TOPIC_IMAGE_REJECTION_TEXTS = {
	notEditor: "You may not change this topic's image.",
	limitReached: "This month's image regenerations are used. Nothing was started.",
	tooLarge: "That image is larger than 10 MB. The image is unchanged.",
	unsupportedType: "That url is not a supported image (jpeg, png, or webp). The image is unchanged.",
	unreadableUrl: "That url is not a supported image (jpeg, png, or webp). The image is unchanged.",
} as const

// the result text of a url's image that is shown to the caller alone until its image moderation can run
const SET_TOPIC_IMAGE_UNCHECKED_TEXT =
	"Only you can see the new image until Carl finishes checking it. Everyone else sees the current image until then."

/**
 * Registers set_topic_image.
 */
export function registerTopicImageTool({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"set_topic_image",
		{
			title: "Change a topic's image",
			description:
				"Change the image of a CarlNotes topic you may edit. With image_url, the public jpeg, png, or webp at that url replaces the image. Without it, Carl renders a new image from the optional image_prompt, which counts against the month's image regenerations and shows on the topic page in about a minute. The previous image is deleted. Use it when the user asks Carl or CarlNotes to change a topic's image, with phrases like change the topic image, regenerate the image, or use this picture.",
			inputSchema: setTopicImagePayload,
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
			_meta: toMcpViewToolMeta("topic"),
		},
		async ({ topic_id, image_url, image_prompt }) => {
			const topicWriteCall = toTopicWriteCall({ toolCaller, routeTopicId, topicId: topic_id })
			if ("rejectionResult" in topicWriteCall) {
				return topicWriteCall.rejectionResult
			}

			// an editor of the topic, which a missing topic never has
			const topicImageEditor = await loadTopicImageEditor(topicWriteCall.userId, topicWriteCall.topicId)
			if (!topicImageEditor) {
				return toTextResult(SET_TOPIC_IMAGE_REJECTION_TEXTS.notEditor, true)
			}

			// a url replaces the image now, and a regenerate starts a render
			const topicImageWrite = { ...topicWriteCall, topicImageEditor }
			return image_url
				? await toSetTopicImageFromUrlResult({ ...topicImageWrite, imageUrl: image_url })
				: await toRegenerateTopicImageResult({ ...topicImageWrite, imagePrompt: image_prompt })
		},
	)
}

// the account that writes, the topic it writes to, and the editor check's result
type TopicImageWrite = Exclude<ReturnType<typeof toTopicWriteCall>, { rejectionResult: unknown }> & {
	topicImageEditor: TopicImageEditor
}

// replace the image with the image at a url, after the upload's checks
async function toSetTopicImageFromUrlResult({
	imageUrl,
	...topicImageWrite
}: TopicImageWrite & { imageUrl: string }): Promise<CallToolResult> {
	const setTopicImageFromUrlResult = await setTopicImageFromUrl({
		topicImageEditor: topicImageWrite.topicImageEditor,
		imageUrl,
		analyticsProperties: topicImageWrite.analyticsProperties,
	})
	if (setTopicImageFromUrlResult.status === "objectionable") {
		return toTextResult(toModerationRejectionMessage(setTopicImageFromUrlResult.category), true)
	}
	if (setTopicImageFromUrlResult.status !== "saved") {
		return toTextResult(SET_TOPIC_IMAGE_REJECTION_TEXTS[setTopicImageFromUrlResult.status], true)
	}

	// an unchecked image is the caller's alone, so its result says so and shows the topic's current image
	const { image, isImageUnchecked } = setTopicImageFromUrlResult
	return toSetTopicImageResult({
		...topicImageWrite,
		image,
		isImageUnchecked,
		text: isImageUnchecked ? SET_TOPIC_IMAGE_UNCHECKED_TEXT : "Saved the new image.",
	})
}

// start a render within the month's regenerations, after the image prompt's moderation
async function toRegenerateTopicImageResult({
	imagePrompt,
	...topicImageWrite
}: TopicImageWrite & { imagePrompt: string | undefined }): Promise<CallToolResult> {
	const regenerateTopicImageResult = await regenerateTopicImage({
		topicImageEditor: topicImageWrite.topicImageEditor,
		imagePrompt,
	})
	if (regenerateTopicImageResult.status === "objectionable") {
		return toTextResult(toModerationRejectionMessage(regenerateTopicImageResult.category), true)
	}
	return regenerateTopicImageResult.status === "started"
		? toSetTopicImageResult({
				...topicImageWrite,
				image: null,
				text: "Carl is rendering a new image. It shows on the topic page in about a minute.",
			})
		: toTextResult(SET_TOPIC_IMAGE_REJECTION_TEXTS.limitReached, true)
}

// the topic MCP view's result: the topic as its page reads it, with the new image if one was saved now. an unchecked
// image is its uploader's alone, so its result shows the topic's current image, whose files an app can read
async function toSetTopicImageResult({
	userId,
	topicId,
	image,
	isImageUnchecked = false,
	text,
}: {
	userId: string
	topicId: string
	image: TopicImageUrls | null
	isImageUnchecked?: boolean
	text: string
}): Promise<CallToolResult> {
	// the topic's fields and its current image as the topic page reads them
	const topicPage = await loadTopicPage(userId, topicId)
	const afterTopicDraft = topicPage ? toEditableTopicDraft(toEditableTopicFields(topicPage)) : null
	const shownImage = isImageUnchecked ? (topicPage?.image ?? null) : image

	// the line the person reads, and the topic MCP view's result
	return toStatusResult(text, { status: "saved", topicId, afterTopicDraft, image: shownImage })
}
