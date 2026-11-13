// the gate a topic other people read passes before it is saved: the owner's Terms acceptance, then the name and
// prompt checked for a violation

import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import type { ProposeTopicEditPayload, UpdateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { eq } from "drizzle-orm"
import { toObjectionableCategory } from "../moderation"
import { hasAcceptedCurrentTerms } from "../termsAcceptance"

// a save stopped by its name, prompt, or tags reading as a violation, for a topic other people read
export type ObjectionableRejection = { status: "objectionable"; category: ModerationCategory }

// a save of a topic other people read stopped by the account not having accepted the current Terms
export type TermsOutdatedRejection = { status: "termsOutdated" }

// the topic's name, prompt, tags, and visibility, and what names a failed check: the owner on a create, the topic on an
// edit
type ToTopicSaveRejectionOptions = {
	name: string
	prompt: string
	tags: string[]
	visibility: UpdateTopicPayload["visibility"]
	subjectId: string
	userId: string
	// whether the name, the prompt, or the tags differ from the saved topic. an unchanged text is not classified again
	isTextChanged?: boolean
}

/**
 * Returns the rejection a topic other people read gets if the owner has not accepted the current Terms, or if its
 * name, prompt, or tags are a violation, or null. A private topic is not checked.
 */
export async function toTopicSaveRejection({
	name,
	prompt,
	tags,
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
		text: tags.length > 0 ? `${name}\n${prompt}\nTags: ${tags.join(", ")}` : `${name}\n${prompt}`,
		textKind: "a topic's name, prompt, and tags",
		subjectKind: "topic",
		subjectId,
	})
	return objectionableCategory ? { status: "objectionable", category: objectionableCategory } : null
}

/**
 * Returns the rejection the editor's check gives a topic edit, on the topic's name, prompt, tags, and visibility as
 * the edit leaves them, or null. An unchanged text is not classified again, and a missing topic is left to the saves.
 */
export async function toTopicEditRejection({
	userId,
	topicId,
	topicEdit,
}: {
	userId: string
	topicId: string
	topicEdit: ProposeTopicEditPayload
}): Promise<ObjectionableRejection | TermsOutdatedRejection | null> {
	// the topic as it stands
	const [topic] = await db
		.select({ name: topics.name, prompt: topics.prompt, tags: topics.tags, visibility: topics.visibility })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return null
	}

	// the topic as the edit leaves it
	const name = topicEdit.name ?? topic.name
	const prompt = topicEdit.prompt ?? topic.prompt
	const tags = topicEdit.tags ?? topic.tags
	return toTopicSaveRejection({
		name,
		prompt,
		tags,
		visibility: topicEdit.visibility ?? topic.visibility,
		subjectId: topicId,
		userId,
		isTextChanged:
			topic.visibility === "private" ||
			name !== topic.name ||
			prompt !== topic.prompt ||
			tags.join("\n") !== topic.tags.join("\n"),
	})
}
