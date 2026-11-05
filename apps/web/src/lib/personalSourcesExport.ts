// explicit export adapters retain visible human and assistant text for local selection
import { TOPIC_ATTACHMENT_MAX_BYTES } from "@carlnotes/contracts/attachmentTypes"
import type { PersonalSourcesImportProvider } from "@carlnotes/contracts/personalSources"
import { normalizePersonalSourcesConversation } from "@carlnotes/contracts/personalSourcesImportText"
import {
	type PersonalSourcesImportConversation,
	personalSourcesImportConversation,
} from "@carlnotes/contracts/personalSourcesPayloads"
import { z } from "zod"
import { readPersonalSourcesArchive } from "./personalSourcesExportArchive"

// preview metadata stays local. only confirmed normalized conversations enter the upload
export type PersonalSourcesExportPreview = {
	provider: PersonalSourcesImportProvider
	conversations: (PersonalSourcesImportConversation & { createdAt: string | null })[]
}
const exportLimit = 1000
const chatGptMessage = z.object({
	author: z.object({ role: z.string() }),
	content: z.object({ content_type: z.string(), parts: z.array(z.unknown()).optional() }),
	metadata: z.object({ is_visually_hidden_from_conversation: z.boolean().optional() }).optional(),
	recipient: z.string().optional(),
})
const chatGptConversation = z.object({
	id: z.string().min(1),
	title: z.string(),
	create_time: z.number().nullable(),
	current_node: z.string(),
	mapping: z.record(z.string(), z.object({ parent: z.string().nullable(), message: chatGptMessage.nullable() })),
})
const claudeMessage = z.object({
	sender: z.enum(["human", "assistant"]),
	text: z.string().optional(),
	content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
})
const claudeConversation = z.object({
	uuid: z.string().min(1),
	name: z.string(),
	created_at: z.string(),
	chat_messages: z.array(claudeMessage),
})

/**
 * Parses a bounded JSON export or its ZIP container without uploading any content.
 */
export async function parsePersonalSourcesExport(bytes: Uint8Array): Promise<PersonalSourcesExportPreview> {
	if (bytes.byteLength > TOPIC_ATTACHMENT_MAX_BYTES) {
		throw new Error("Choose an export of at most 10 MiB.")
	}

	// recognize ZIP by its signature, then decode only the supported conversation JSON file
	const jsonBytes = bytes[0] === 0x50 && bytes[1] === 0x4b ? await readPersonalSourcesArchive(bytes) : bytes
	const text = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes)
	const preview = parsePersonalSourcesExportJson(JSON.parse(text))
	const conversationIds = preview.conversations.map((conversation) => conversation.conversationId)
	if (new Set(conversationIds).size !== conversationIds.length) {
		throw new Error("This export repeats conversation identifiers. Paste the selected text instead.")
	}
	return preview
}

/**
 * Previews a pasted transcript through the same explicit-selection representation.
 */
export function previewPersonalSourcesTranscript({
	title,
	text,
}: {
	title: string
	text: string
}): PersonalSourcesExportPreview {
	if (new TextEncoder().encode(text).byteLength > TOPIC_ATTACHMENT_MAX_BYTES) {
		throw new Error("Paste at most 10 MiB of text.")
	}
	const conversation = personalSourcesImportConversation.parse(
		normalizePersonalSourcesConversation({ conversationId: "transcript", title, text }),
	)
	return { provider: "transcript", conversations: [{ ...conversation, createdAt: null }] }
}

// adapters require their recorded export shape and never infer conversations from arbitrary nested objects
function parsePersonalSourcesExportJson(content: unknown): PersonalSourcesExportPreview {
	const chatGptExport = z.array(chatGptConversation).min(1).max(exportLimit).safeParse(content)
	if (chatGptExport.success) {
		return { provider: "chatgpt", conversations: chatGptExport.data.map(toChatGptPreview) }
	}
	const claudeExport = z.array(claudeConversation).min(1).max(exportLimit).safeParse(content)
	if (claudeExport.success) {
		return { provider: "claude", conversations: claudeExport.data.map(toClaudePreview) }
	}
	throw new Error("This export format is unsupported. Paste the conversations you want to import instead.")
}

// ChatGPT's current-node parent chain identifies the visible branch without hidden tool results or other branches
function toChatGptPreview(
	conversation: z.infer<typeof chatGptConversation>,
): PersonalSourcesExportPreview["conversations"][number] {
	const messages: string[] = []
	const visited = new Set<string>()
	let nodeId: string | null = conversation.current_node
	while (nodeId !== null) {
		const node: z.infer<typeof chatGptConversation>["mapping"][string] | undefined = conversation.mapping[nodeId]
		if (!node || visited.has(nodeId)) {
			throw new Error("This conversation has an unsupported message tree. Paste its visible text instead.")
		}
		visited.add(nodeId)
		const messageText = toChatGptMessageText(node.message)
		if (messageText) {
			messages.push(messageText)
		}
		nodeId = node.parent
	}

	// preserve visible message order and the export's display date
	const normalized = normalizePersonalSourcesConversation({
		conversationId: conversation.id,
		title: conversation.title,
		text: messages.reverse().join("\n\n"),
	})
	return {
		...personalSourcesImportConversation.parse(normalized),
		createdAt: toImportDate(conversation.create_time === null ? null : conversation.create_time * 1000),
	}
}

// attachments, tool calls, system text, hidden messages, and non-text parts never become transcript content
function toChatGptMessageText(message: z.infer<typeof chatGptMessage> | null): string | null {
	if (
		!message ||
		!["user", "assistant"].includes(message.author.role) ||
		message.metadata?.is_visually_hidden_from_conversation
	) {
		return null
	}
	if (
		(message.recipient && message.recipient !== "all") ||
		!["text", "multimodal_text"].includes(message.content.content_type)
	) {
		return null
	}
	const text = message.content.parts
		?.filter((part): part is string => typeof part === "string")
		.join("\n")
		.trim()
	const speaker = { user: "Human", assistant: "Assistant" }[message.author.role]
	return text ? `${speaker}: ${text}` : null
}

// Claude exports expose visible text separately from attachments and structured tool content
function toClaudePreview(
	conversation: z.infer<typeof claudeConversation>,
): PersonalSourcesExportPreview["conversations"][number] {
	const messages = conversation.chat_messages
		.map((message) => {
			const parts = message.content?.filter((part) => part.type === "text").map((part) => part.text ?? "")
			const text = (message.text ?? parts?.join("\n") ?? "").trim()
			return text ? `${message.sender === "human" ? "Human" : "Assistant"}: ${text}` : ""
		})
		.filter(Boolean)
	const normalized = normalizePersonalSourcesConversation({
		conversationId: conversation.uuid,
		title: conversation.name,
		text: messages.join("\n\n"),
	})
	return { ...personalSourcesImportConversation.parse(normalized), createdAt: toImportDate(conversation.created_at) }
}

// missing or unrecognized dates do not become fabricated timestamps
function toImportDate(value: string | number | null): string | null {
	if (value === null) {
		return null
	}
	const date = new Date(value)
	return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
