// sender-only personal sources representations and the receiving source identities
import { z } from "zod"
import { personalSourceKinds } from "./enums"
import { personalSourcesConversationUrl, personalSourcesReferenceUrl } from "./personalSourcesUrls"

// one provisional runaway-agent ceiling shared by AI sends and forwarded email on every plan
export const PERSONAL_SOURCES_DAILY_SEND_LIMIT = 200
export const PERSONAL_SOURCES_DAILY_LIMIT_MESSAGE = "The day's limit is reached."

// confirmation, paging, and bounded model context limits
export const PERSONAL_SOURCES_PAGE_SIZE = 20
export const PERSONAL_SOURCES_ITEMS_PER_PAGE = 5
export const PERSONAL_SOURCES_TITLE_CODE_POINTS = 200
export const PERSONAL_SOURCES_SUMMARY_CODE_POINTS = 2000
export const PERSONAL_SOURCES_SEND_TOPIC_LIMIT = 20
export const PERSONAL_SOURCES_SEND_LINK_LIMIT = 10
export const PERSONAL_SOURCES_IMPORT_LINK_LIMIT = 100
export const PERSONAL_SOURCES_CONTEXT_INPUT_CHARS = 80_000
export const PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS = 8000
export const AI_AGENT_API_KEY_LIMIT = 10

// server-authenticated provenance. inbound send payloads never accept these fields
export const personalSourcesImportProvider = z.enum(["chatgpt", "claude", "transcript"])
export const aiAgentSourceConfig = z.discriminatedUnion("delivery", [
	z.strictObject({
		delivery: z.literal("oauth"),
		clientId: z.string().min(1).max(2048),
		appDomain: z.string().min(1).max(253).nullable(),
	}),
	z.strictObject({ delivery: z.literal("api_key"), apiKeyId: z.string().min(1).max(100) }),
	z.strictObject({ delivery: z.literal("import"), provider: personalSourcesImportProvider }),
])
export type AiAgentSourceConfig = z.infer<typeof aiAgentSourceConfig>
export type PersonalSourcesImportProvider = z.infer<typeof personalSourcesImportProvider>

// uploaded format labels do not imply an authenticated assistant connection
export const PERSONAL_SOURCES_IMPORT_LABELS: Record<PersonalSourcesImportProvider, string> = {
	chatgpt: "ChatGPT import",
	claude: "Claude import",
	transcript: "Pasted transcript",
}

// candidate outcomes describe this Topic's processing, separately from private references
const personalSourceLinkDetails = z.object({ url: personalSourcesReferenceUrl, title: z.string().optional() })
const personalSourceLinkOutcome = z.discriminatedUnion("status", [
	personalSourceLinkDetails.extend({ status: z.literal("queued") }),
	personalSourceLinkDetails.extend({ status: z.literal("scored") }),
	personalSourceLinkDetails.extend({ status: z.literal("finding"), findingId: z.string(), href: z.string() }),
	personalSourceLinkDetails.extend({ status: z.literal("not_scored"), reason: z.string() }),
])
export type PersonalSourceLinkOutcome = z.infer<typeof personalSourceLinkOutcome>

// decrypted payloads only cross authenticated sender boundaries
export const personalSourceEntryPayload = z.object({
	title: z.string(),
	text: z.string(),
	sender: z.string(),
	links: z.array(personalSourcesReferenceUrl).max(PERSONAL_SOURCES_IMPORT_LINK_LIMIT),
	chatUrl: personalSourcesConversationUrl.nullable(),
	senderKind: z.enum(["agent", "import", "personal_forward", "newsletter", "unknown"]),
})
const personalSourceEntry = personalSourceEntryPayload.extend({
	id: z.string(),
	sourceId: z.string(),
	topicId: z.string(),
	origin: z.enum(["send", "email", "import"]),
	receivedAt: z.iso.datetime(),
	expiresAt: z.iso.datetime().nullable(),
	summarizedAt: z.iso.datetime().nullable(),
	omittedLinkCount: z.number().int().nonnegative(),
	linkOutcomes: z.array(personalSourceLinkOutcome).max(PERSONAL_SOURCES_IMPORT_LINK_LIMIT).default([]),
})
export type PersonalSourceEntryPayload = z.infer<typeof personalSourceEntryPayload>
export type PersonalSourceEntry = z.infer<typeof personalSourceEntry>

// context state describes whether private text can contribute to the next scan
const personalSourcesContextState = z.object({
	status: z.enum(["empty", "pending", "ready", "failed", "budget", "missing_key"]),
	hasIncompleteCoverage: z.boolean(),
	activatedAt: z.iso.datetime().nullable(),
})
const personalSource = z.object({
	id: z.string(),
	groupId: z.string().optional(),
	sourceKind: z.enum(personalSourceKinds),
	label: z.string(),
	weekEntryCount: z.number().int().nonnegative(),
	entryCount: z.number().int().nonnegative(),
	isConnected: z.boolean(),
	waitingLinkCount: z.number().int().nonnegative(),
})
export const topicPersonalSources = z.object({
	sources: z.array(personalSource),
	context: personalSourcesContextState,
	sourceCount: z.number().int().nonnegative(),
	canReceive: z.boolean(),
})
export const personalSourceEntryPage = z.object({
	entries: z.array(personalSourceEntry).max(PERSONAL_SOURCES_PAGE_SIZE),
	nextCursor: z.string().nullable(),
	pagination: z
		.object({
			pageNumber: z.number().int().positive(),
			pageCount: z.number().int().positive(),
			entryOffset: z.number().int().nonnegative(),
			totalEntryCount: z.number().int().nonnegative(),
		})
		.optional(),
})
export type PersonalSource = z.infer<typeof personalSource>
export type TopicPersonalSources = z.infer<typeof topicPersonalSources>
export type PersonalSourceEntryPage = z.infer<typeof personalSourceEntryPage>

// Topic info receives title/date rows without full stored text or private links
export const personalSourceTitlePage = personalSourceEntryPage.extend({
	entries: z
		.array(personalSourceEntry.pick({ id: true, title: true, receivedAt: true, expiresAt: true }))
		.max(PERSONAL_SOURCES_PAGE_SIZE),
})
export type PersonalSourceTitlePage = z.infer<typeof personalSourceTitlePage>

// the sender’s summary and the entries included in its latest revision
const personalSourcesContextResponse = z.object({
	text: z.string().max(PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS).nullable(),
	expiresAt: z.iso.datetime().nullable(),
	includedEntryCount: z.number().int().nonnegative().default(0),
	hasIncompleteCoverage: z.boolean().default(false),
})
export type PersonalSourcesContextResponse = z.infer<typeof personalSourcesContextResponse>

// acceptance contains only a bounded confirmation suitable for MCP views
const personalSourcesTopicChoice = z.object({ id: z.string(), name: z.string(), url: z.string() })
const personalSourcesSendConfirmation = z.object({
	topic: personalSourcesTopicChoice,
	entryId: z.string(),
	queuedLinkCount: z.number().int().nonnegative(),
})
export const personalSourcesSendResult = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("accepted"),
		confirmations: z.array(personalSourcesSendConfirmation).min(1).max(PERSONAL_SOURCES_SEND_TOPIC_LIMIT).optional(),
		topic: personalSourcesTopicChoice,
		entryId: z.string(),
		title: z.string(),
		queuedLinkCount: z.number().int().nonnegative(),
	}),
	z.object({ status: z.literal("quota"), resetAt: z.iso.datetime() }),
	z.object({ status: z.literal("disconnected") }),
	z.object({ status: z.literal("unavailable"), reason: z.enum(["encryption", "disabled"]) }),
	z.object({
		status: z.literal("conflict"),
		reason: z.enum(["retry_mismatch", "removed"]),
	}),
	z.object({ status: z.literal("not_found") }),
])
export type PersonalSourcesSendResult = z.infer<typeof personalSourcesSendResult>

// import confirmations list only the selected entries, with no transcript echoed into transport logs
export const personalSourcesImportResult = z.discriminatedUnion("status", [
	z.object({ status: z.literal("accepted"), entryIds: z.array(z.string()).min(1).max(1000) }),
	z.object({ status: z.literal("not_found") }),
	z.object({ status: z.literal("unavailable"), reason: z.enum(["encryption", "disabled"]) }),
	z.object({
		status: z.literal("conflict"),
		reason: z.enum(["retry_mismatch", "removed"]),
	}),
])
export type PersonalSourcesImportResult = z.infer<typeof personalSourcesImportResult>
