// the render of an image's original from a scene: the model call, in the house style or as written, the drawn bytes
// kept until the image is current, so a retry draws nothing, and the original in its format

import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import {
	attachmentExists,
	deleteStoredObjects,
	getAttachmentBytes,
	recordPendingObjectDeletions,
	uploadAttachment,
} from "@carlnotes/db/store"
import { renderTopicImage, type TopicImageRenderResult } from "@carlnotes/models/topicImageModel"
import { reportError } from "@carlnotes/server/monitoring"
import {
	TOPIC_IMAGE_FORMAT,
	type TopicImageFormat,
	type TopicImageOriginal,
	toTopicImageOriginal,
} from "./topicImageFiles"
import { toTopicImagePrompt } from "./writeTopicImageScene"

// why a render drew nothing: a spent budget, a rejection, or a failure worth another attempt
export type TopicImageRenderFailureOutcome = Exclude<TopicImageRenderResult["outcome"], "rendered">

// a render that drew nothing, with its outcome and the reason
export class TopicImageRenderFailure extends Error {
	readonly outcome: TopicImageRenderFailureOutcome

	constructor(outcome: TopicImageRenderFailureOutcome, reason: string) {
		super(reason)
		this.outcome = outcome
	}
}

// how long kept drawn bytes stay if nothing deletes them first, which outlasts every attempt to store their image
const DRAWN_IMAGE_LIFETIME_MS = 2 * DAY_MS

// what a drawn image is kept for: a topic image render's row, a published podcast episode's first image, or a film's
// first image
type DrawnImageSubjectKind = "topic-image-render" | "podcast-episode" | "topic-video"

/**
 * Returns the object key that one subject's drawn bytes are kept under until its image is current. The key is never
 * served.
 */
export function toDrawnImageKey(subjectKind: DrawnImageSubjectKind, subjectId: string): string {
	return `drawn-images/${subjectKind}/${subjectId}`
}

// the scene to draw, whether the house style follows it, the model that draws it, the format it is drawn in, which is
// the topic image's if none is given, the key the render bills, or the master key if no key is given, and the key the
// drawn bytes are kept under, if the caller's retry should draw nothing
export type RenderTopicImageOriginalOptions = {
	scene: string
	isHouseStyle: boolean
	model: string
	format?: TopicImageFormat
	litellmApiKey?: string
	drawnImageKey?: string
}

/**
 * Draws an image from the scene, followed by the format's house style if asked, and returns its original in the
 * format. Given a drawn image key, it returns the bytes that an earlier attempt kept under the key with no model call,
 * and keeps the bytes of a new draw there, for the caller to delete with `deleteDrawnImage` once the image is current.
 * A render that drew nothing throws a TopicImageRenderFailure with why.
 */
export async function renderTopicImageOriginal({
	scene,
	isHouseStyle,
	model,
	format = TOPIC_IMAGE_FORMAT,
	litellmApiKey,
	drawnImageKey,
}: RenderTopicImageOriginalOptions): Promise<TopicImageOriginal> {
	// the bytes that an earlier attempt drew and kept are the image, so a retry pays for no second draw
	if (drawnImageKey && (await attachmentExists(drawnImageKey))) {
		return toTopicImageOriginal(await getAttachmentBytes(drawnImageKey), format)
	}

	// draw the image
	const renderResult = await renderTopicImage({
		prompt: isHouseStyle ? await toTopicImagePrompt(scene, format.stylePromptName) : scene,
		model,
		aspectRatio: format.aspectRatio,
		drawSize: format.drawSize,
		litellmApiKey,
	})
	if (renderResult.outcome !== "rendered") {
		throw new TopicImageRenderFailure(renderResult.outcome, renderResult.reason)
	}

	// keep the drawn bytes once they have made an original, so bytes that cannot be read are never kept
	const original = await toTopicImageOriginal(renderResult.imageBytes, format)
	if (drawnImageKey) {
		await keepDrawnImage(drawnImageKey, renderResult.imageBytes)
	}
	return original
}

/**
 * Deletes the drawn bytes kept under a key, once their image is current.
 */
export async function deleteDrawnImage(drawnImageKey: string): Promise<void> {
	await deleteStoredObjects([drawnImageKey])
}

// keep a draw's bytes under their key, with a pending deletion recorded first, so bytes that nothing deletes still go
// in time. a failed keep is reported, and the draw stands
async function keepDrawnImage(drawnImageKey: string, imageBytes: Uint8Array): Promise<void> {
	try {
		// the pending deletion first, then the bytes
		const nextTryAt = new Date(Date.now() + DRAWN_IMAGE_LIFETIME_MS)
		await recordPendingObjectDeletions({ handle: db, objectKeys: [drawnImageKey], nextTryAt })
		await uploadAttachment(drawnImageKey, imageBytes, "application/octet-stream")
	} catch (error) {
		reportError(error, "topic-image", { step: "keep-drawn-image" })
	}
}
