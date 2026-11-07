// normalized text and safe public links shared by local previews and server revalidation
import { PERSONAL_SOURCES_IMPORT_LINK_LIMIT, PERSONAL_SOURCES_TITLE_CODE_POINTS } from "./personalSources"
import type { PersonalSourcesImportConversation } from "./personalSourcesPayloads"
import { personalSourcesCandidateUrl, personalSourcesReferenceUrl, toTextUrls } from "./personalSourcesUrls"

/**
 * Extracts bounded public links and a separate assistant reference from a selected transcript.
 */
export function normalizePersonalSourcesConversation({
	conversationId,
	title,
	text,
}: {
	conversationId: string
	title: string
	text: string
}): PersonalSourcesImportConversation {
	// normalize line endings while preserving the explicitly selected transcript
	const normalizedText = text.replace(/\r\n?/g, "\n").replaceAll("\0", "").trim()

	// keep each public link, and the first url that names an assistant's conversation
	const links = new Set<string>()
	let chatUrl: string | null = null
	for (const url of toTextUrls(normalizedText)) {
		const candidate = personalSourcesCandidateUrl.safeParse(url)
		if (candidate.success) {
			links.add(candidate.data)
			continue
		}

		// a url that is no public link may still name the conversation
		const reference = personalSourcesReferenceUrl.safeParse(url)
		if (reference.success && isAssistantReference(reference.data)) {
			chatUrl ??= reference.data
		}
	}

	// retain one deterministic bounded queue while accounting for omitted safe URLs
	return {
		conversationId,
		title: [...title.trim()].slice(0, PERSONAL_SOURCES_TITLE_CODE_POINTS).join("") || "Imported conversation",
		text: normalizedText,
		links: [...links].slice(0, PERSONAL_SOURCES_IMPORT_LINK_LIMIT),
		omittedLinkCount: Math.max(0, links.size - PERSONAL_SOURCES_IMPORT_LINK_LIMIT),
		chatUrl,
	}
}

// only assistant conversation addresses receive the sender-only reference affordance
function isAssistantReference(url: string): boolean {
	const hostname = new URL(url).hostname.toLowerCase()
	return ["chatgpt.com", "chat.openai.com", "claude.ai"].includes(hostname)
}
