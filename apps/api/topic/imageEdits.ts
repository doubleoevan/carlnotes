// the image edit steps a topic, a podcast episode, a Topic Post, and a film share. the editor's regeneration quota, the
// upload's body limit, the upload's checks, and the image prompt moderation

import { ADMIN_QUOTA } from "@carlnotes/contracts/plans"
import { type ImageRegenerationQuota, MAX_TOPIC_IMAGE_UPLOAD_BYTES } from "@carlnotes/contracts/topicImages"
import { loadTopicImageRegenerationQuota } from "@carlnotes/db/quotas"
import {
	type TopicImageFormat,
	type TopicImageOriginal,
	toTopicImageOriginal,
	toTopicImageUploadType,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import type { Context } from "hono"
import { MULTIPART_ENVELOPE_BYTES, toBodyLimit } from "../bodyLimit"
import type { AppEnv } from "../currentUser"
import { toObjectionableCategory, toObjectionableContentResponse, toObjectionableImageCategory } from "../moderation"

// the body limit of an upload, set before parseBody buffers the body: the image limit plus the multipart envelope
export const imageUploadBodyLimit = toBodyLimit(MAX_TOPIC_IMAGE_UPLOAD_BYTES + MULTIPART_ENVELOPE_BYTES, "too-large")

// what an edit's moderation names: the kind of image and the id of its topic or podcast episode
type ImageEditSubject = { subjectKind: string; subjectId: string }

/**
 * Returns the response that rejects an objectionable image prompt, or null for no image prompt or a clean one.
 */
export async function toImagePromptRejection(
	context: Context<AppEnv>,
	{ imagePrompt, subjectKind, subjectId }: ImageEditSubject & { imagePrompt: string | undefined },
): Promise<Response | null> {
	// an image prompt goes to the image model alone, so it passes the moderation first
	const objectionableCategory = imagePrompt
		? await toObjectionableCategory({ text: imagePrompt, textKind: "an image prompt", subjectKind, subjectId })
		: null
	return objectionableCategory ? toObjectionableContentResponse(context, objectionableCategory) : null
}

/**
 * Reads the request's uploaded image as the original to store, cropped to the format's ratio, which is 3:2 if no format
 * is given, or the response that rejects it for its size, its type, or the image moderation.
 */
export async function readUploadedImageOriginal(
	context: Context<AppEnv>,
	{ subjectKind, subjectId, format }: ImageEditSubject & { format?: Pick<TopicImageFormat, "width" | "height"> },
): Promise<{ original: TopicImageOriginal } | { response: Response }> {
	// the file, checked by its size and by what its bytes decode as
	const uploadedFile = (await context.req.parseBody()).image
	if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
		return { response: context.json({ error: "unsupported-type" }, 400) }
	}
	if (uploadedFile.size > MAX_TOPIC_IMAGE_UPLOAD_BYTES) {
		return { response: context.json({ error: "too-large" }, 413) }
	}

	// the bytes decode as a jpeg, a png, or a webp, or the upload is rejected
	const uploadedBytes = new Uint8Array(await uploadedFile.arrayBuffer())
	const original = toTopicImageUploadType(uploadedBytes)
		? await toTopicImageOriginal(uploadedBytes, format).catch(() => null)
		: null
	if (!original) {
		return { response: context.json({ error: "unsupported-type" }, 400) }
	}

	// the moderation, on the cropped original that will show. a skipped or failed check lets the upload through
	const objectionableCategory = await toObjectionableImageCategory({
		dataUrl: `data:image/jpeg;base64,${Buffer.from(original.jpegBytes).toString("base64")}`,
		subjectKind,
		subjectId,
	})

	// an unreadable image is an unsupported type, and an objectionable one is rejected
	if (objectionableCategory === "unreadable") {
		return { response: context.json({ error: "unsupported-type" }, 400) }
	}
	if (objectionableCategory) {
		return { response: toObjectionableContentResponse(context, objectionableCategory) }
	}
	return { original }
}

/**
 * Returns an editor's regenerations this month, or null for an admin, who is never limited and sees no count.
 */
export async function loadEditorImageRegenerationQuota(userId: string): Promise<ImageRegenerationQuota | null> {
	const { used, limit } = await loadTopicImageRegenerationQuota(userId)
	return limit < ADMIN_QUOTA ? { used, limit } : null
}
