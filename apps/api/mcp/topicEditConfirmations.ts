// the confirmation an mcp topic edit needs before it makes a topic public or removes a source: a keyed signature over
// the edit, the topic as it stood when previewed, and an expiry. a save changes the topic, so a confirmation never
// matches twice, and an edit made elsewhere since the preview voids it
import { MINUTE_MS } from "@carlnotes/contracts/time"
import type { EditableTopicFields } from "@carlnotes/contracts/topicEdits"
import type { ProposeTopicEditPayload } from "@carlnotes/contracts/topicPayloads"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"
import { toCanonicalJson } from "../canonicalJson"

// how long a confirmation stays good after its preview
export const TOPIC_EDIT_CONFIRMATION_LIFETIME_MS = 15 * MINUTE_MS

// why an edit needs the user's agreement: it makes the topic public, or it removes a source
export type TopicEditConfirmationReason = "goesPublic" | "removesSources"

// who saves the edit, the topic it edits, the edit, and the topic's fields as they stand
type TopicEditConfirmationOptions = {
	userId: string
	topicId: string
	topicEdit: ProposeTopicEditPayload
	editableTopicFields: EditableTopicFields
}

/**
 * Returns why an edit needs the user's agreement before it saves, empty for an edit that saves at once.
 */
export function toTopicEditConfirmationReasons(
	editableTopicFields: EditableTopicFields,
	topicEdit: ProposeTopicEditPayload,
): TopicEditConfirmationReason[] {
	const isGoingPublic = topicEdit.visibility === "public" && editableTopicFields.visibility !== "public"
	const isRemovingSources = (topicEdit.removeSourceIds ?? []).length > 0
	return [
		...(isGoingPublic ? (["goesPublic"] as const) : []),
		...(isRemovingSources ? (["removesSources"] as const) : []),
	]
}

/**
 * Returns a confirmation for an edit over the topic as it stands, good for fifteen minutes.
 */
export function toTopicEditConfirmation(
	topicEditConfirmationSubject: TopicEditConfirmationOptions,
	now: number = Date.now(),
): string {
	const expiresAt = now + TOPIC_EDIT_CONFIRMATION_LIFETIME_MS
	return `${expiresAt}.${toTopicEditSignature(topicEditConfirmationSubject, expiresAt)}`
}

/**
 * Returns whether a confirmation was issued for this edit over the topic as it now stands, and has not expired.
 */
export function isTopicEditConfirmed(
	topicEditConfirmationSubject: TopicEditConfirmationOptions,
	confirmation: string,
	now: number = Date.now(),
): boolean {
	// the expiry and the signature, and an expired or malformed confirmation confirms nothing
	const [expiresAtText, signature] = confirmation.split(".")
	const expiresAt = Number(expiresAtText)
	if (!signature || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
		return false
	}

	// the signature over the edit and the topic as they are now
	const expectedSignature = toTopicEditSignature(topicEditConfirmationSubject, expiresAt)
	return isSameSignature({ expectedSignature, signature })
}

// the keyed signature over the edit, the topic's fields, and the expiry. the sources and invites sort by their own keys,
// so the same topic read twice signs the same
function toTopicEditSignature(
	{ userId, topicId, topicEdit, editableTopicFields }: TopicEditConfirmationOptions,
	expiresAt: number,
): string {
	// the fields the edit is previewed over, in a fixed order
	const sortedTopicFields = {
		...editableTopicFields,
		sources: [...editableTopicFields.sources].sort((first, second) => first.id.localeCompare(second.id)),
		invites: [...editableTopicFields.invites].sort((first, second) =>
			(first.email ?? "").localeCompare(second.email ?? ""),
		),
	}

	// sign the purpose beside the values, so no other signature under the same secret can match
	return toAuthSecretSignature({
		value: toCanonicalJson({
			purpose: "mcp topic edits",
			userId,
			topicId,
			topicEdit,
			editableTopicFields: sortedTopicFields,
			expiresAt,
		}),
		purpose: "mcp topic edits",
		encoding: "base64url",
	})
}
