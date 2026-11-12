import type { PersonalSourceEntry, TopicPersonalSources } from "@carlnotes/contracts/personalSources"
import { isCodexConversationUrl } from "@carlnotes/contracts/personalSourcesUrls"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { AiProviderIcon } from "@carlnotes/nightshift/aiProviderIcons"
import { toMonthDayLabel } from "./labels"

export const PERSONAL_SOURCES_PRIVACY_NOTICE =
	"Only you can read your Personal sources items. They can help score any Topic you can edit. Shared explanations and podcasts use only the linked pages; changing Topic visibility never reveals your sent text."
export const PERSONAL_SOURCES_RETENTION_NOTICE =
	"Your items stay encrypted until you delete them. Deleting an entry removes its waiting links and rebuilds private context; it does not delete existing Findings or refund usage."
export const PERSONAL_SOURCES_IMPORT_NOTICE =
	"Select conversations from a ChatGPT or Claude JSON/ZIP export, or paste text. Preview happens on your device; only selected conversations upload. The file and selected batch must each fit within 10 MiB."

// the same labels describe private context readiness on every platform
const CONTEXT_LABELS: Record<TopicPersonalSources["context"]["status"], string> = {
	empty: "No private context yet.",
	pending: "Rebuilding private context. New content will help a later brew.",
	ready: "Private context is ready for your next brew.",
	failed: "Private context could not be rebuilt. Carl will retry.",
	budget: "Private context is waiting for the Topic owner’s model budget.",
	missing_key: "Private context is waiting for the Topic owner’s model key.",
}

/**
 * Labels the section with the sender's current item count.
 */
export function toPersonalSourcesSectionTitle(entryCount: number): string {
	return `Personal sources · ${toCountLabel(entryCount, "item")}`
}

/**
 * Totals the sender's live items across Personal sources.
 */
export function toPersonalSourcesEntryCount(metadata: TopicPersonalSources): number {
	return metadata.sources.reduce((total, source) => total + source.entryCount, 0)
}

/**
 * Describes whether the bounded private context is ready and whether text was omitted.
 */
export function toPersonalSourcesContextLabel(context: TopicPersonalSources["context"]): string {
	return `${CONTEXT_LABELS[context.status]}${context.hasIncompleteCoverage ? " Some text is outside the model's bounded reading allowance." : ""}`
}

/**
 * Shows the sender's Personal sources while they can edit the Topic or read their retained history.
 */
export function canShowTopicPersonalSources(
	topic: Pick<TopicResponse, "isTopicOwner" | "canReadPersonalSources"> & { canEdit?: boolean },
): boolean {
	return topic.canReadPersonalSources ?? topic.canEdit ?? topic.isTopicOwner
}

/**
 * Formats received dates identically on web and both phones.
 */
export function toPersonalSourceDate(receivedAt: string): string {
	return toMonthDayLabel(receivedAt, { timeZone: "UTC" })
}

// identify conversation destinations by their exact host
export type PersonalSourceConversationProvider = AiProviderIcon | "other"
const CONVERSATION_PROVIDERS = new Map<string, PersonalSourceConversationProvider>([
	["claude.ai", "claude"],
	["chatgpt.com", "chatgpt"],
	["chat.openai.com", "chatgpt"],
	["gemini.google.com", "gemini"],
	["grok.com", "grok"],
	["perplexity.ai", "perplexity"],
	["chat.deepseek.com", "deepseek"],
	["copilot.microsoft.com", "copilot"],
	["cursor.com", "cursor"],
])

/**
 * Selects the platform mark from the conversation destination.
 */
export function toPersonalSourceConversationProvider(url: string): PersonalSourceConversationProvider {
	if (isCodexConversationUrl(url)) {
		return "codex"
	}
	try {
		// normalize public web destinations without trusting names embedded in paths or queries
		const parsedUrl = new URL(url)
		if (!/^https?:$/.test(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
			return "other"
		}

		// the host without www or a trailing dot, and a Gemini share or a Copilot chat on a shared host
		const hostname = parsedUrl.hostname.replace(/^www\./, "").replace(/\.$/, "")
		if (hostname === "g.co" && /^\/gemini\/share\//.test(parsedUrl.pathname)) {
			return "gemini"
		}
		if (hostname === "m365.cloud.microsoft" && /^\/chat(?:\/|$)/.test(parsedUrl.pathname)) {
			return "copilot"
		}

		// a Claude Code session on claude.ai and a Grok chat on x.com
		if (hostname === "claude.ai" && /^\/code(?:\/|$)/.test(parsedUrl.pathname)) {
			return "claude_code"
		}
		if (hostname === "x.com" && /^\/i\/grok(?:\/|$)/.test(parsedUrl.pathname)) {
			return "grok"
		}

		// every other host by its exact name
		return CONVERSATION_PROVIDERS.get(hostname) ?? "other"
	} catch {
		return "other"
	}
}

// the destination names used in the visible conversation action
const CONVERSATION_PROVIDER_LABELS = {
	claude: "Claude",
	codex: "Codex",
	claude_code: "Claude Code",
	chatgpt: "ChatGPT",
	gemini: "Gemini",
	grok: "Grok",
	perplexity: "Perplexity",
	deepseek: "DeepSeek",
	copilot: "Microsoft Copilot",
	cursor: "Cursor",
} satisfies Record<AiProviderIcon, string>

/**
 * Names the shared conversation action and its known destination.
 */
export function toPersonalSourceConversationLabel(provider: PersonalSourceConversationProvider): string {
	return provider === "other"
		? "Open shared conversation"
		: `Open shared conversation in ${CONVERSATION_PROVIDER_LABELS[provider]}`
}

/**
 * Selects a known platform mark from the authenticated sender label.
 */
export function toPersonalSourceSenderProvider(sender: string): PersonalSourceConversationProvider {
	const label = sender
		.trim()
		.toLowerCase()
		.replace(/ import$/, "")
	const provider = Object.entries(CONVERSATION_PROVIDER_LABELS).find(([, name]) => name.toLowerCase() === label)?.[0]
	return (provider as PersonalSourceConversationProvider | undefined) ?? "other"
}

/**
 * Names a supplied conversation destination, falling back to the authenticated sender label.
 */
export function toPersonalSourceSenderIdentity(entry: Pick<PersonalSourceEntry, "sender" | "origin" | "chatUrl">): {
	label: string
	provider: PersonalSourceConversationProvider
} {
	// name a conversation link by its destination, and anything else by its sender label
	const provider = toPersonalSourceConversationProvider(entry.chatUrl ?? "")
	if (entry.origin !== "email" && entry.chatUrl) {
		return { label: provider === "other" ? entry.sender : CONVERSATION_PROVIDER_LABELS[provider], provider }
	}
	return { label: entry.sender, provider: toPersonalSourceSenderProvider(entry.sender) }
}
