// bounded explicit send and selected-conversation import requests
import { z } from "zod"
import { TOPIC_ATTACHMENT_MAX_BYTES } from "./attachmentTypes"
import {
	PERSONAL_SOURCES_IMPORT_LINK_LIMIT,
	PERSONAL_SOURCES_SEND_LINK_LIMIT,
	PERSONAL_SOURCES_SEND_TOPIC_LIMIT,
	PERSONAL_SOURCES_SUMMARY_CODE_POINTS,
	PERSONAL_SOURCES_TITLE_CODE_POINTS,
	personalSourcesImportProvider,
} from "./personalSources"
import { personalSourcesCandidateUrl, personalSourcesConversationUrl } from "./personalSourcesUrls"

// count Unicode code points without treating surrogate pairs as two characters
const personalSourcesTitle = z
	.string()
	.trim()
	.min(1)
	.refine((title) => [...title].length <= PERSONAL_SOURCES_TITLE_CODE_POINTS, "Use at most 200 characters.")
const personalSourcesSummary = z
	.string()
	.trim()
	.min(1)
	.refine((summary) => [...summary].length <= PERSONAL_SOURCES_SUMMARY_CODE_POINTS, "Use at most 2,000 characters.")
const personalSourcesRequestId = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-zA-Z0-9_-]+$/)
const personalSourcesLinks = z
	.array(personalSourcesCandidateUrl)
	.max(PERSONAL_SOURCES_SEND_LINK_LIMIT)
	.refine((links) => new Set(links).size === links.length, "Use distinct links.")

// strict objects prevent caller-controlled identity, sender, and retention fields
export const personalSourcesSendPayload = z
	.strictObject({
		topic_id: z.string().min(1).max(100).optional(),
		topic_ids: z
			.array(z.string().min(1).max(100))
			.min(1)
			.max(PERSONAL_SOURCES_SEND_TOPIC_LIMIT)
			.refine((topicIds) => new Set(topicIds).size === topicIds.length, "Use distinct Topics.")
			.optional(),
		title: personalSourcesTitle,
		summary: personalSourcesSummary,
		links: personalSourcesLinks.default([]),
		chat_url: personalSourcesConversationUrl.optional(),
		request_id: personalSourcesRequestId.optional(),
	})
	.refine(
		(payload) => Boolean(payload.topic_id) !== Boolean(payload.topic_ids),
		"Supply topic_ids or topic_id, exclusively.",
	)
	.refine(
		(payload) => !payload.chat_url || !payload.links.includes(payload.chat_url),
		"Keep the chat reference outside the link queue.",
	)
export type PersonalSourcesSendPayload = z.infer<typeof personalSourcesSendPayload>

// routing preserves an optional private reference outside the matching content
export const suggestTopicsPayload = z.strictObject({
	chat_url: personalSourcesConversationUrl.optional(),
	title: personalSourcesTitle,
	summary: personalSourcesSummary,
	links: personalSourcesLinks.default([]),
	cursor: z.string().max(500).optional(),
	query: z.string().trim().max(200).optional(),
	autocomplete: z
		.boolean()
		.optional()
		.describe("Card-only editable Topic-name autocomplete. Skips content matching and stores nothing."),
})
export type SuggestTopicsPayload = z.infer<typeof suggestTopicsPayload>

// normalized transcripts selected in the browser are revalidated before storage
export const personalSourcesImportConversation = z.strictObject({
	conversationId: z.string().min(1).max(200),
	title: personalSourcesTitle,
	text: z.string().min(1).max(TOPIC_ATTACHMENT_MAX_BYTES),
	links: z.array(personalSourcesCandidateUrl).max(PERSONAL_SOURCES_IMPORT_LINK_LIMIT),
	omittedLinkCount: z.number().int().nonnegative().max(1_000_000),
	chatUrl: personalSourcesConversationUrl.nullable(),
})
export const personalSourcesImportPayload = z
	.strictObject({
		requestId: personalSourcesRequestId,
		provider: personalSourcesImportProvider,
		conversations: z.array(personalSourcesImportConversation).min(1).max(1000),
	})
	.refine(
		(payload) => new TextEncoder().encode(JSON.stringify(payload)).byteLength <= TOPIC_ATTACHMENT_MAX_BYTES,
		"Select at most 10 MiB per import.",
	)
export const personalSourcesPageQuery = z.object({ cursor: z.string().max(500).optional() })
export const personalSourcesNumberedPageQuery = personalSourcesPageQuery
	.extend({
		page: z.coerce.number().int().min(1).max(1_000_000).optional(),
	})
	.refine((query) => !query.cursor || query.page === undefined, "Choose a page or a cursor, not both.")
export type PersonalSourcesImportPayload = z.infer<typeof personalSourcesImportPayload>
export type PersonalSourcesImportConversation = z.infer<typeof personalSourcesImportConversation>
