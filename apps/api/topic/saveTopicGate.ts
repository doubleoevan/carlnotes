// the gate a topic other people read passes before it is saved: the owner's Terms acceptance, then the name and
// prompt checked for a violation

import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import type { UpdateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import { toObjectionableCategory } from "../moderation"
import { hasAcceptedCurrentTerms } from "../termsAcceptance"

// a save stopped by its name or prompt reading as a violation, for a topic other people read
export type ObjectionableRejection = { status: "objectionable"; category: ModerationCategory }

// a save of a topic other people read stopped by the account not having accepted the current Terms
export type TermsOutdatedRejection = { status: "termsOutdated" }

// the topic's name, prompt, and visibility, and what names a failed check: the owner on a create, the topic on an edit
type ToTopicSaveRejectionOptions = {
	name: string
	prompt: string
	visibility: UpdateTopicPayload["visibility"]
	subjectId: string
	userId: string
	// whether the name or the prompt differs from the saved topic. an unchanged text is not classified again
	isTextChanged?: boolean
}

/**
 * Returns the rejection a topic other people read gets if the owner has not accepted the current Terms, or if its
 * name or prompt is a violation, or null. A private topic is not checked.
 */
export async function toTopicSaveRejection({
	name,
	prompt,
	visibility,
	subjectId,
	userId,
	isTextChanged = true,
}: ToTopicSaveRejectionOptions): Promise<ObjectionableRejection | TermsOutdatedRejection | null> {
	// a private topic passes, and a stale account is rejected before anything is classified
	if (visibility === "private") {
		return null
	}
	if (!(await hasAcceptedCurrentTerms(userId))) {
		return { status: "termsOutdated" }
	}

	// the text is classified only if it changed
	if (!isTextChanged) {
		return null
	}
	const objectionableCategory = await toObjectionableCategory({
		text: `${name}\n${prompt}`,
		textKind: "a topic's name and prompt",
		subjectKind: "topic",
		subjectId,
	})
	return objectionableCategory ? { status: "objectionable", category: objectionableCategory } : null
}
