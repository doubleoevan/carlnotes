// the image edit steps a topic, a podcast episode, a Topic Post, and a film share. the editor's regeneration quota, the
// upload's body limit, the upload's checks, and the image prompt moderation

import type { ModerationCategory } from "@carlnotes/contracts/moderation"
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
 * Returns the category an image prompt violates, or null for no image prompt or a clean one.
 */
export async function toImagePromptCategory({
	imagePrompt,
	subjectKind,
	subjectId,
}: ImageEditSubject & { imagePrompt: string | undefined }): Promise<ModerationCategory | null> {
	// an image prompt goes to the image model alone, so it passes the moderation first
	return imagePrompt
		? await toObjectionableCategory({ text: imagePrompt, textKind: "an image prompt", subjectKind, subjectId })
		: null
}

/**
 * Returns the response that rejects an objectionable image prompt, or null for no image prompt or a clean one.
 */
export async function toImagePromptRejection(
	context: Context<AppEnv>,
	imagePromptSubject: ImageEditSubject & { imagePrompt: string | undefined },
): Promise<Response | null> {
	const objectionableCategory = await toImagePromptCategory(imagePromptSubject)
	return objectionableCategory ? toObjectionableContentResponse(context, objectionableCategory) : null
}

// why an image's bytes were not stored: too large, not a jpeg, png, or webp the decoder reads, or objectionable
export type ImageBytesRejection =
	| { status: "tooLarge" }
	| { status: "unsupportedType" }
	| { status: "objectionable"; category: ModerationCategory }

/**
 * Checks an image's bytes as the original to store, cropped to the format's ratio, which is 3:2 if no format is
 * given, or returns why they were rejected: their size, what they decode as, or the image moderation.
 */
export async function toCheckedImageOriginal(
	imageBytes: Uint8Array,
	{ subjectKind, subjectId, format }: ImageEditSubject & { format?: Pick<TopicImageFormat, "width" | "height"> },
): Promise<{ status: "checked"; original: TopicImageOriginal } | ImageBytesRejection> {
	// an image past the upload limit is too large
	if (imageBytes.byteLength > MAX_TOPIC_IMAGE_UPLOAD_BYTES) {
		return { status: "tooLarge" }
	}

	// the bytes decode as a jpeg, a png, or a webp, or the image is rejected
	const original = toTopicImageUploadType(imageBytes)
		? await toTopicImageOriginal(imageBytes, format).catch(() => null)
		: null
	if (!original) {
		return { status: "unsupportedType" }
	}

	// the moderation, on the cropped original that will show. a skipped or failed check lets the image through
	const objectionableCategory = await toObjectionableImageCategory({
		dataUrl: `data:image/jpeg;base64,${Buffer.from(original.jpegBytes).toString("base64")}`,
		subjectKind,
		subjectId,
	})

	// an unreadable image is an unsupported type, and an objectionable one is rejected
	if (objectionableCategory === "unreadable") {
		return { status: "unsupportedType" }
	}
	return objectionableCategory
		? { status: "objectionable", category: objectionableCategory }
		: { status: "checked", original }
}

// the response an image's rejection gets: a 413 for its size, a 400 for its type, or the moderation 422
function toImageBytesRejectionResponse(context: Context<AppEnv>, rejection: ImageBytesRejection): Response {
	switch (rejection.status) {
		// the size and the type are the file's
		case "tooLarge":
			return context.json({ error: "too-large" }, 413)
		case "unsupportedType":
			return context.json({ error: "unsupported-type" }, 400)
		// the moderation names the category
		case "objectionable":
			return toObjectionableContentResponse(context, rejection.category)
	}
}

/**
 * Reads the request's uploaded image as the original to store, cropped to the format's ratio, which is 3:2 if no format
 * is given, or the response that rejects it for its size, its type, or the image moderation.
 */
export async function readUploadedImageOriginal(
	context: Context<AppEnv>,
	imageEditSubject: ImageEditSubject & { format?: Pick<TopicImageFormat, "width" | "height"> },
): Promise<{ original: TopicImageOriginal } | { response: Response }> {
	// the file, which an empty or missing part never is
	const uploadedFile = (await context.req.parseBody()).image
	if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
		return { response: context.json({ error: "unsupported-type" }, 400) }
	}

	// a file past the limit is rejected before its bytes are read
	if (uploadedFile.size > MAX_TOPIC_IMAGE_UPLOAD_BYTES) {
		return { response: context.json({ error: "too-large" }, 413) }
	}

	// the bytes, checked by what they decode as and the moderation
	const checkedImage = await toCheckedImageOriginal(new Uint8Array(await uploadedFile.arrayBuffer()), imageEditSubject)
	return checkedImage.status === "checked"
		? { original: checkedImage.original }
		: { response: toImageBytesRejectionResponse(context, checkedImage) }
}

/**
 * Returns an editor's regenerations this month, or null for an admin, who is never limited and sees no count.
 */
export async function loadEditorImageRegenerationQuota(userId: string): Promise<ImageRegenerationQuota | null> {
	const { used, limit } = await loadTopicImageRegenerationQuota(userId)
	return limit < ADMIN_QUOTA ? { used, limit } : null
}
