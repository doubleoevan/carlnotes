// a topic image's edits: the editor check, a regenerate from an optional image prompt, and a replacement from an
// image's bytes or from a public image url

import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import {
	MAX_TOPIC_IMAGE_UPLOAD_BYTES,
	TOPIC_IMAGE_UPLOAD_TYPES,
	type TopicImageUrls,
	toTopicImageUrls,
} from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { fetchLinkPreviewImage } from "@carlnotes/pipeline/linkPreview"
import { storeTopicImageFiles } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { dropUnpublishedUncheckedImage, publishOrSaveUncheckedImage } from "@carlnotes/pipeline/uncheckedImages"
import { trackEvent } from "@carlnotes/server/analytics"
import { OversizedBodyError } from "@carlnotes/server/publicFetch"
import { eq } from "drizzle-orm"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import {
	type CheckedImageOriginal,
	type ImageBytesRejection,
	toCheckedImageOriginal,
	toImagePromptCategory,
} from "./imageEdits"
import { namedTopicColumns } from "./permissions"

// the image types an image url may return, which are the upload's
const TOPIC_IMAGE_URL_TYPES = new Set<string>(TOPIC_IMAGE_UPLOAD_TYPES)

// a signed-in user the edit gate grants, and the topic they edit
export type TopicImageEditor = { userId: string; topic: { id: string; ownerId: string } }

/**
 * Loads the topic for a user who may edit it, or null if the topic is missing or the user may not edit it.
 */
export async function loadTopicImageEditor(userId: string, topicId: string): Promise<TopicImageEditor | null> {
	const [topic] = await db.select(namedTopicColumns).from(topics).where(eq(topics.id, topicId))
	return topic && (await isAllowed(userId, "topic:edit", topic)) ? { userId, topic } : null
}

/**
 * Starts a fresh render on the better model from an optional image prompt, within the editor's monthly regenerations,
 * after the image prompt's moderation.
 */
export async function regenerateTopicImage({
	topicImageEditor,
	imagePrompt,
}: {
	topicImageEditor: TopicImageEditor
	imagePrompt: string | undefined
}): Promise<
	| { status: "started"; renderId: string }
	| { status: "limitReached" }
	| { status: "objectionable"; category: ModerationCategory }
> {
	// the month's regenerations
	if (!(await isAllowed(topicImageEditor.userId, "topicImage:regenerate"))) {
		return { status: "limitReached" }
	}

	// the image prompt's moderation
	const objectionableCategory = await toImagePromptCategory({
		imagePrompt,
		subjectKind: "topic image prompt",
		subjectId: topicImageEditor.topic.id,
	})
	if (objectionableCategory) {
		return { status: "objectionable", category: objectionableCategory }
	}

	// the render row and its workflow, in place of an unchecked upload shown to its uploader alone. a published unchecked
	// image stays
	await dropUnpublishedUncheckedImage({ subjectKind: "topicImage", subjectId: topicImageEditor.topic.id })
	const renderId = await startTopicImageRender({
		topicId: topicImageEditor.topic.id,
		userId: topicImageEditor.userId,
		kind: "regenerate",
		model: topicImageRegenerateModel(),
		imagePrompt,
	})
	return { status: "started", renderId }
}

// an uploaded image as its uploader sees it: its urls, and whether it is shown to them alone until its image
// moderation can run
export type UploadedTopicImage = { image: TopicImageUrls; isImageUnchecked: boolean }

/**
 * Stores a checked original as the topic's current image, or saves it as unchecked for its uploader alone if its image
 * moderation could not run on an invite or public topic, and returns its urls with whether its uploader alone sees it.
 */
export async function storeUploadedTopicImage({
	topicImageEditor,
	checkedImage: { original, isUnchecked },
	analyticsProperties,
}: {
	topicImageEditor: TopicImageEditor
	checkedImage: CheckedImageOriginal
	analyticsProperties: AnalyticsProperties
}): Promise<UploadedTopicImage> {
	// the files under their hash, then the row that makes the upload current, or the unchecked image's row
	const topicId = topicImageEditor.topic.id
	const hash = await storeTopicImageFiles(topicId, original)
	const uploadedImageOutcome = await publishOrSaveUncheckedImage({
		subjectKind: "topicImage",
		subjectId: topicId,
		uploaderUserId: topicImageEditor.userId,
		imageHash: hash,
		width: original.width,
		height: original.height,
		isUnchecked,
	})

	// the upload event names whether the owner made it
	trackEvent("topic_image_upload", topicImageEditor.userId, {
		...analyticsProperties,
		topicId,
		isOwner: topicImageEditor.topic.ownerId === topicImageEditor.userId,
	})
	return { image: toTopicImageUrls(topicId, hash), isImageUnchecked: uploadedImageOutcome === "unchecked" }
}

/**
 * Replaces the topic's image with the image at a public url, fetched through the guard every user-supplied url takes,
 * then checked like an upload. A private address, a page, or an image of another type is an unreadable url.
 */
export async function setTopicImageFromUrl({
	topicImageEditor,
	imageUrl,
	analyticsProperties,
}: {
	topicImageEditor: TopicImageEditor
	imageUrl: string
	analyticsProperties: AnalyticsProperties
}): Promise<({ status: "saved" } & UploadedTopicImage) | ImageBytesRejection | { status: "unreadableUrl" }> {
	// the bytes, within the upload's limit. an image past it is too large, and any other failure is unreadable
	const fetchedImage = await fetchLinkPreviewImage(imageUrl, MAX_TOPIC_IMAGE_UPLOAD_BYTES, TOPIC_IMAGE_URL_TYPES).catch(
		(error: unknown) => (error instanceof OversizedBodyError ? "tooLarge" : "unreadableUrl"),
	)
	if (typeof fetchedImage === "string") {
		return { status: fetchedImage }
	}
	return replaceTopicImageFromBytes({ topicImageEditor, imageBytes: fetchedImage.bytes, analyticsProperties })
}

// replace the topic's image with an image's bytes, after the upload's checks, or return why it did not
async function replaceTopicImageFromBytes({
	topicImageEditor,
	imageBytes,
	analyticsProperties,
}: {
	topicImageEditor: TopicImageEditor
	imageBytes: Uint8Array
	analyticsProperties: AnalyticsProperties
}): Promise<({ status: "saved" } & UploadedTopicImage) | ImageBytesRejection> {
	// the upload's checks: the size, the type, and the moderation
	const checkedImage = await toCheckedImageOriginal(imageBytes, {
		subjectKind: "topic image",
		subjectId: topicImageEditor.topic.id,
	})
	if (checkedImage.status !== "checked") {
		return checkedImage
	}

	// the checked original becomes the current image, or is saved as unchecked
	const uploadedTopicImage = await storeUploadedTopicImage({ topicImageEditor, checkedImage, analyticsProperties })
	return { status: "saved", ...uploadedTopicImage }
}
