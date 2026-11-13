// the check every text and image other users see goes through before it is stored. a violation is rejected in Carl's
// words with the draft kept. a skipped or failed check lets the post through, and a failure is reported without the
// text or the image. an image the moderation cannot read is rejected
import {
	type ModerationCategory,
	OBJECTIONABLE_CONTENT_REJECTION,
	type ObjectionableContentResponse,
} from "@carlnotes/contracts/moderation"
import {
	classifyImage,
	classifyUserText,
	type ModeratedTextKind,
	type ModerationClassification,
} from "@carlnotes/models/moderation"
import { reportError } from "@carlnotes/server/monitoring"
import type { Context } from "hono"

// the text under review, what it is, and what names it in a failure report. never the text itself
export type ToObjectionableCategoryOptions = {
	text: string
	textKind: ModeratedTextKind
	subjectKind: string
	subjectId: string
}

/**
 * Returns the category a text violates, or null if it may be stored: it is clean, or the classification was skipped
 * or failed, which is reported with the subject's kind and id and never its text.
 */
export async function toObjectionableCategory({
	text,
	textKind,
	subjectKind,
	subjectId,
}: ToObjectionableCategoryOptions): Promise<ModerationCategory | null> {
	// an empty text has nothing to check
	if (!text.trim()) {
		return null
	}

	// the classification, failing open on anything but a verdict
	const classification = await classifyUserText({ text, textKind })
	return toViolationCategory({ classification, subjectKind, subjectId })
}

// the image under review, and what names it in a failure report. never the image itself
export type ToObjectionableImageCategoryOptions = { dataUrl: string; subjectKind: string; subjectId: string }

/**
 * Returns the category an image violates, unreadable if the moderation could not read it, or null if it may be stored.
 * A skipped or failed check returns null, and a failure is reported with the subject's kind and id and never the image.
 */
export async function toObjectionableImageCategory({
	dataUrl,
	subjectKind,
	subjectId,
}: ToObjectionableImageCategoryOptions): Promise<ModerationCategory | "unreadable" | null> {
	const classification = await classifyImage({ dataUrl })
	return classification.outcome === "unreadable"
		? "unreadable"
		: toViolationCategory({ classification, subjectKind, subjectId })
}

// a classification, and what names its subject in a failure report
type ToViolationCategoryOptions = {
	classification: ModerationClassification
	subjectKind: string
	subjectId: string
}

// the category a classification found, or null for a clean verdict, a skip, or a failure, which is logged and reported
function toViolationCategory({
	classification,
	subjectKind,
	subjectId,
}: ToViolationCategoryOptions): ModerationCategory | null {
	// a failure posts unchecked and reports which subject it was
	if (classification.outcome === "failed") {
		console.error("the moderation check failed, so the post goes up unchecked", classification.error)
		reportError(classification.error, "api-route", {
			moderationSubjectKind: subjectKind,
			moderationSubjectId: subjectId,
		})
		return null
	}

	// no proxy or key means no check, and a clean verdict names no category
	if (classification.outcome !== "classified") {
		return null
	}
	return classification.verdict.isViolation ? classification.verdict.category : null
}

// what a check that fails closed finds in an image's frames: nothing, a violation, an image it cannot read, or no
// verdict at all
export type StrictImageModeration =
	| { outcome: "clean" }
	| { outcome: "objectionable"; category: ModerationCategory }
	| { outcome: "unreadable" }
	| { outcome: "unavailable" }

// the frames under review as jpegs, and what names them in a failure report
export type ToStrictImageModerationOptions = { frameJpegs: Uint8Array[]; subjectKind: string; subjectId: string }

/**
 * Checks every frame of an image other users will see in public, failing closed: a skipped or failed check of any frame
 * is unavailable and never clean, and a failure is reported with the subject's kind and id and never the image.
 */
export async function toStrictImageModeration({
	frameJpegs,
	subjectKind,
	subjectId,
}: ToStrictImageModerationOptions): Promise<StrictImageModeration> {
	// every frame at once
	const classifications = await Promise.all(
		frameJpegs.map((frameJpeg) =>
			classifyImage({ dataUrl: `data:image/jpeg;base64,${Buffer.from(frameJpeg).toString("base64")}` }),
		),
	)

	// a violation in any frame rejects it, then a frame the check could not read
	for (const classification of classifications) {
		if (classification.outcome === "classified" && classification.verdict.isViolation) {
			return { outcome: "objectionable", category: classification.verdict.category }
		}
	}
	if (classifications.some((classification) => classification.outcome === "unreadable")) {
		return { outcome: "unreadable" }
	}

	// a frame with no verdict leaves the image unchecked, so it is unavailable, and a failure is reported
	const failedClassification = classifications.find((classification) => classification.outcome === "failed")
	if (failedClassification?.outcome === "failed") {
		reportError(failedClassification.error, "api-route", {
			moderationSubjectKind: subjectKind,
			moderationSubjectId: subjectId,
		})
	}
	const isEveryFrameClassified = classifications.every((classification) => classification.outcome === "classified")
	return isEveryFrameClassified ? { outcome: "clean" } : { outcome: "unavailable" }
}

/**
 * Returns the 422 a violating text or image gets, naming its category.
 */
export function toObjectionableContentResponse(context: Context, category: ModerationCategory): Response {
	const body: ObjectionableContentResponse = { rejection: OBJECTIONABLE_CONTENT_REJECTION, category }
	return context.json(body, 422)
}
