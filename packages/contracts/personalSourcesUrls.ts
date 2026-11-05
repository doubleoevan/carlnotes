// public candidate links and sender-only references accepted at personal sources boundaries
import { z } from "zod"
import { toCanonicalUrl } from "./canonicalUrl"
import { isInternalAddress } from "./networkAddress"

// credentials and reference records stay out of globally shared resource addresses
const PRIVATE_PARAMETERS =
	/^(?:access[-_]?token|token|auth|authorization|api[-_]?key|secret|password|signature|sig|key|x-amz-.+|x-goog-.+)$/i
const REFERENCE_HOSTS = [
	"chatgpt.com",
	"chat.openai.com",
	"claude.ai",
	"gemini.google.com",
	"grok.com",
	"perplexity.ai",
	"chat.deepseek.com",
	"copilot.microsoft.com",
	"notion.so",
	"notion.site",
	"docs.google.com",
	"drive.google.com",
	"mail.google.com",
	"outlook.live.com",
	"outlook.office.com",
	"slack.com",
	"teams.microsoft.com",
	"linear.app",
	"dropbox.com",
	"sharepoint.com",
]

// references permit private record paths, but never local hosts or embedded credentials
export const personalSourcesReferenceUrl = z
	.string()
	.trim()
	.max(2000)
	.refine(isPersonalSourcesPublicUrl, "Use a public HTTP(S) address without credentials.")
// conversation references may open the local Codex app without making a public snapshot
export const personalSourcesConversationUrl = z
	.string()
	.trim()
	.max(2000)
	.refine(
		(url) => isCodexConversationUrl(url) || isPersonalSourcesPublicUrl(url),
		"Use a public HTTP(S) address or an existing Codex chat link.",
	)

/**
 * Recognizes only an existing Codex chat, excluding settings, new-chat actions, and query parameters.
 */
export function isCodexConversationUrl(url: string): boolean {
	return /^codex:\/\/threads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url)
}

export const personalSourcesCandidateUrl = personalSourcesReferenceUrl
	.refine(isPersonalSourcesCandidateUrl, "Keep private references and tracking links outside the public link queue.")
	.transform(toCanonicalUrl)

/**
 * Checks the literal address before any server-side DNS or redirect validation.
 */
export function isPersonalSourcesPublicUrl(url: string): boolean {
	try {
		// reject protocols, credentials, and hosts that cannot name public pages
		const parsedUrl = new URL(url)
		const hostname = parsedUrl.hostname
			.replace(/^\[|\]$/g, "")
			.replace(/\.$/, "")
			.toLowerCase()
		if (!/^https?:$/.test(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
			return false
		}
		const isAddressLiteral = hostname.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
		return (
			!(isAddressLiteral && isInternalAddress(hostname)) &&
			(hostname.includes(".") || hostname.includes(":")) &&
			!/(?:^|\.)(?:localhost|local|internal|test|invalid|home|lan)$/.test(hostname)
		)
	} catch {
		return false
	}
}

/**
 * Identifies public page candidates without private record or tracking credentials.
 */
function isPersonalSourcesCandidateUrl(url: string): boolean {
	if (!isPersonalSourcesPublicUrl(url)) {
		return false
	}

	// keep known private work records and bearer query parameters sender-only
	const parsedUrl = new URL(url)
	const hostname = parsedUrl.hostname.replace(/\.$/, "").toLowerCase()
	if (REFERENCE_HOSTS.some((referenceHost) => hostname === referenceHost || hostname.endsWith(`.${referenceHost}`))) {
		return false
	}
	if ([...parsedUrl.searchParams.keys()].some((parameter) => PRIVATE_PARAMETERS.test(parameter))) {
		return false
	}

	// keep private agent and conversation paths outside public page scoring
	if (
		(hostname === "cursor.com" && /^\/(?:agents|s)(?:\/|$)/.test(parsedUrl.pathname)) ||
		(hostname === "x.com" && /^\/i\/grok(?:\/|$)/.test(parsedUrl.pathname)) ||
		(hostname === "github.com" && /^\/copilot(?:\/|$)/.test(parsedUrl.pathname)) ||
		(hostname === "m365.cloud.microsoft" && /^\/chat(?:\/|$)/.test(parsedUrl.pathname))
	) {
		return false
	}

	// reject tracking endpoints and token-bearing share paths without following them
	return (
		!/(?:^|[/.\-_])(?:unsubscribe|optout|click|track|tracking|pixel|share|shared)(?:[/.\-_]|$)/i.test(
			parsedUrl.pathname,
		) && !/(?:^|\.)(?:click|track|tracking|links)\./i.test(hostname)
	)
}
