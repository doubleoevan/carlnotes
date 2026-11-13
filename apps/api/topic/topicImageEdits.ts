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
import { storeTopicImageFiles, type TopicImageOriginal } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { replaceTopicImage, startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { trackEvent } from "@carlnotes/server/analytics"
import { OversizedBodyError } from "@carlnotes/server/publicFetch"
import { eq } from "drizzle-orm"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { type ImageBytesRejection, toCheckedImageOriginal, toImagePromptCategory } from "./imageEdits"
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

	// the render row and its workflow
	const renderId = await startTopicImageRender({
		topicId: topicImageEditor.topic.id,
		userId: topicImageEditor.userId,
		kind: "regenerate",
		model: topicImageRegenerateModel(),
		imagePrompt,
	})
	return { status: "started", renderId }
}

/**
 * Stores a checked original as the topic's current image, and returns its urls.
 */
export async function storeUploadedTopicImage({
	topicImageEditor,
	original,
	analyticsProperties,
}: {
	topicImageEditor: TopicImageEditor
	original: TopicImageOriginal
	analyticsProperties: AnalyticsProperties
}): Promise<TopicImageUrls> {
	// the files under their hash, then the row that makes the upload current
	const hash = await storeTopicImageFiles(topicImageEditor.topic.id, original)
	await replaceTopicImage({
		topicId: topicImageEditor.topic.id,
		renderId: null,
		hash,
		origin: "uploaded",
		scene: null,
		model: null,
		imagePrompt: null,
		width: original.width,
		height: original.height,
		costDollars: 0,
	})

	// the upload event names whether the owner made it
	trackEvent("topic_image_upload", topicImageEditor.userId, {
		...analyticsProperties,
		topicId: topicImageEditor.topic.id,
		isOwner: topicImageEditor.topic.ownerId === topicImageEditor.userId,
	})
	return toTopicImageUrls(topicImageEditor.topic.id, hash)
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
}): Promise<{ status: "saved"; image: TopicImageUrls } | ImageBytesRejection | { status: "unreadableUrl" }> {
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
}): Promise<{ status: "saved"; image: TopicImageUrls } | ImageBytesRejection> {
	// the upload's checks: the size, the type, and the moderation
	const checkedImage = await toCheckedImageOriginal(imageBytes, {
		subjectKind: "topic image",
		subjectId: topicImageEditor.topic.id,
	})
	if (checkedImage.status !== "checked") {
		return checkedImage
	}

	// the checked original becomes the current image
	const image = await storeUploadedTopicImage({
		topicImageEditor,
		original: checkedImage.original,
		analyticsProperties,
	})
	return { status: "saved", image }
}
