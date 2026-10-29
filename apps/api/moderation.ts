// the check every text other users read goes through before it is stored: a violation is rejected in Carl's words
// with the draft kept, and a classification that returns no verdict lets the text through and reports itself without it
import {
	type ModerationCategory,
	OBJECTIONABLE_TEXT_REJECTION,
	type ObjectionableTextResponse,
} from "@carlnotes/contracts/moderation"
import { classifyUserText, type ModeratedTextKind } from "@carlnotes/models/moderation"
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
	if (classification.outcome === "failed") {
		console.error("the moderation check failed, so the text posts unchecked", classification.error)
		reportError(classification.error, "api-route", {
			moderationSubjectKind: subjectKind,
			moderationSubjectId: subjectId,
		})
		return null
	}

	// no proxy means no check, and a clean verdict names no category
	if (classification.outcome === "skipped") {
		return null
	}
	return classification.verdict.isViolation ? classification.verdict.category : null
}

/**
 * Returns the 422 a violating text gets, naming its category.
 */
export function toObjectionableTextResponse(context: Context, category: ModerationCategory): Response {
	const body: ObjectionableTextResponse = { rejection: OBJECTIONABLE_TEXT_REJECTION, category }
	return context.json(body, 422)
}
