import {
	type PersonalSourcesImportPayload,
	personalSourcesImportPayload,
} from "@carlnotes/contracts/personalSourcesPayloads"
import type { PersonalSourcesExportPreview } from "./personalSourcesExport"

/**
 * Builds an upload from explicitly selected conversations and drops local preview metadata.
 */
export function toSelectedPersonalSourcesImport({
	preview,
	selectedIds,
	requestId,
}: {
	preview: PersonalSourcesExportPreview
	selectedIds: Set<string>
	requestId: string
}): PersonalSourcesImportPayload {
	// refuse ambiguous selections from exports that repeat a conversation identifier
	const conversationIds = preview.conversations.map((conversation) => conversation.conversationId)
	if (new Set(conversationIds).size !== conversationIds.length) {
		throw new Error("This export repeats conversation identifiers. Paste the selected text instead.")
	}
	const conversations = preview.conversations
		.filter((conversation) => selectedIds.has(conversation.conversationId))
		.map(({ createdAt: _createdAt, ...conversation }) => conversation)
	return personalSourcesImportPayload.parse({ requestId, provider: preview.provider, conversations })
}
