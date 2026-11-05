// bind a Topic Draft preview to the account, client, exact fields, and a short expiry
import { MINUTE_MS } from "@carlnotes/contracts/time"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"
import { toCanonicalJson } from "../canonicalJson"
import type { TopicDraftReceipt } from "../topic/topicDraftReceipts"

type DraftSubject = { userId: string; clientId: string | null; topicDraft: TopicDraft }

/**
 * Signs the exact draft the user must confirm before the existing creation path runs.
 */
export function toTopicDraftConfirmation(subject: DraftSubject, now = Date.now()): string {
	const expiresAt = now + 15 * MINUTE_MS
	return `${expiresAt}.${signDraft(subject, expiresAt)}`
}

/**
 * Rejects missing, altered, cross-account, cross-client, and expired draft confirmations.
 */
export function isTopicDraftConfirmed(
	subject: DraftSubject,
	confirmation: string | undefined,
	now = Date.now(),
): confirmation is string {
	const [expiry, signature, extra] = (confirmation ?? "").split(".")
	const expiresAt = Number(expiry)
	if (
		extra !== undefined ||
		!signature ||
		expiry !== String(expiresAt) ||
		!Number.isSafeInteger(expiresAt) ||
		expiresAt <= now
	) {
		return false
	}
	return isSameSignature({ expectedSignature: signDraft(subject, expiresAt), signature })
}

/**
 * Identifies one verified confirmation without placing its signature or draft contents in the database.
 */
export function toTopicDraftReceipt(confirmation: string): TopicDraftReceipt {
	const digest = toAuthSecretSignature({
		value: confirmation,
		purpose: "mcp topic draft receipt",
		encoding: "base64url",
	})
	return { id: `mcp-topic-draft:${digest}`, expiresAt: new Date(Number(confirmation.split(".")[0])) }
}

// separate draft signatures from edit and authentication signatures
function signDraft(subject: DraftSubject, expiresAt: number): string {
	return toAuthSecretSignature({
		value: toCanonicalJson({ purpose: "mcp topic draft creation", ...subject, expiresAt }),
		purpose: "mcp topic draft creation",
		encoding: "base64url",
	})
}
