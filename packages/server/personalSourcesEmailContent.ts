// extract bounded mail text and public links without loading remote HTML assets
import {
	PERSONAL_SOURCES_IMPORT_LINK_LIMIT,
	PERSONAL_SOURCES_TITLE_CODE_POINTS,
	type PersonalSourceEntryPayload,
} from "@carlnotes/contracts/personalSources"
import type { ReceivedPersonalSourcesEmail } from "@carlnotes/contracts/personalSourcesEmail"
import { personalSourcesCandidateUrl } from "@carlnotes/contracts/personalSourcesUrls"
import { toHtmlText } from "@carlnotes/contracts/text"

// large messages retain a bounded original excerpt, with the same deterministic URL limit as imports
const MAX_EMAIL_TEXT_CHARS = 80_000
const NON_CONTENT_ELEMENTS = "script, style, head, template, svg, iframe, object, form, noscript"
const NEWSLETTER_LINK_PATTERN = /(?:unsubscribe|opt[-_]?out|list-manage)/i
const SERVICE_LINK_PATTERN =
	/(?:unsubscribe|opt[-_]?out|list-manage|clicktrack|track\/click|\/(?:wf\/)?click(?:\/|$)|\/tracking(?:\/|$)|\/redirect(?:\/|$))/i
const TRACKING_HOST_PATTERN = /^(?:click|clicks|track|tracking|links)\./i

/**
 * Normalizes one authenticated provider response into encrypted-entry content and safe queue candidates.
 */
export function normalizePersonalSourcesEmail({
	email,
	ownerEmail,
	isOwnerEmailVerified,
}: {
	email: ReceivedPersonalSourcesEmail
	ownerEmail: string
	isOwnerEmailVerified: boolean
}): { payload: PersonalSourceEntryPayload; omittedLinkCount: number } {
	// remove executable and non-content subtrees before extracting either text or anchors
	const sanitizedHtml = new HTMLRewriter()
		.on(NON_CONTENT_ELEMENTS, {
			element: (element) => {
				element.remove()
			},
		})
		.transform(email.html ?? "")
	const text = (email.text?.trim() || toEmailHtmlText(sanitizedHtml))
		.replaceAll("\0", "")
		.slice(0, MAX_EMAIL_TEXT_CHARS)
	const { links, hasNewsletterMarker } = extractEmailLinks(text, sanitizedHtml, email.headers)
	const sender = toEmailSenderAddress(email.from)
	return {
		payload: {
			title: [...(email.subject?.trim() || "Email")].slice(0, PERSONAL_SOURCES_TITLE_CODE_POINTS).join(""),
			text,
			sender: sender ?? "Unknown sender",
			senderKind: classifyPersonalSourcesSender({ email, ownerEmail, isOwnerEmailVerified, hasNewsletterMarker }),
			links: links.slice(0, PERSONAL_SOURCES_IMPORT_LINK_LIMIT),
			chatUrl: null,
		},
		omittedLinkCount: Math.max(0, links.length - PERSONAL_SOURCES_IMPORT_LINK_LIMIT),
	}
}

/**
 * Reads a single mailbox without trusting display names or copied forwarding headers.
 */
export function toEmailSenderAddress(from: string): string | null {
	const mailbox = (from.match(/^(?:[^<>,@\r\n]*|"[^"\r\n]*"\s*)<([^<>\r\n]+)>$/)?.[1] ?? from).trim().toLowerCase()
	return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(mailbox) ? mailbox : null
}

/**
 * Requires receiver-computed aligned DKIM and DMARC for authenticated sender privileges.
 */
export function hasAuthenticatedPersonalSourcesSender(email: ReceivedPersonalSourcesEmail): boolean {
	return email.authentication?.dkim === "pass" && email.authentication.dmarc === "pass"
}

// preserve paragraph boundaries so a first-line Topic hint cannot swallow the message's content
function toEmailHtmlText(html: string): string {
	return html
		.replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote)\s*>|<br\b[^>]*>/gi, "\n")
		.split("\n")
		.map(toHtmlText)
		.filter(Boolean)
		.join("\n")
}

// recognize list mail before assigning direct-forward provenance
function classifyPersonalSourcesSender({
	email,
	ownerEmail,
	isOwnerEmailVerified,
	hasNewsletterMarker,
}: {
	email: ReceivedPersonalSourcesEmail
	ownerEmail: string
	isOwnerEmailVerified: boolean
	hasNewsletterMarker: boolean
}): PersonalSourceEntryPayload["senderKind"] {
	if (hasNewsletterMarker || Object.keys(email.headers).some((name) => /^list-(id|unsubscribe|post)$/i.test(name))) {
		return "newsletter"
	}
	if (
		isOwnerEmailVerified &&
		hasAuthenticatedPersonalSourcesSender(email) &&
		toEmailSenderAddress(email.from) === ownerEmail.toLowerCase()
	) {
		return "personal_forward"
	}
	return "unknown"
}

// anchors and plaintext URLs pass the same safety and tracking filters. No link is followed during extraction
function extractEmailLinks(
	text: string,
	html: string,
	headers: Record<string, string>,
): { links: string[]; hasNewsletterMarker: boolean } {
	const links = new Set<string>()
	const excludedLinks = new Set<string>()
	let hasNewsletterMarker = false
	for (const [name, value] of Object.entries(headers)) {
		if (!/^list-unsubscribe$/i.test(name)) {
			continue
		}
		for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/g)) {
			const candidate = personalSourcesCandidateUrl.safeParse(match[0])
			if (candidate.success) {
				excludedLinks.add(candidate.data)
			}
		}
	}
	const addLink = (value: string): void => {
		// recognize newsletter controls before the candidate filter removes their URLs
		hasNewsletterMarker ||= NEWSLETTER_LINK_PATTERN.test(value)
		const candidate = personalSourcesCandidateUrl.safeParse(value)
		if (!candidate.success) {
			return
		}
		if (SERVICE_LINK_PATTERN.test(value)) {
			return
		}
		const url = new URL(candidate.data)
		if (
			TRACKING_HOST_PATTERN.test(url.hostname) ||
			["url", "redirect", "redirect_url", "target", "destination"].some((name) => url.searchParams.has(name))
		) {
			return
		}
		links.add(candidate.data)
	}
	for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
		addLink(match[0].replace(/[.,;:!?)\]}]+$/, ""))
	}
	let anchorText = ""
	new HTMLRewriter()
		.on("a[href]", {
			element: (element) => {
				const href = element.getAttribute("href") ?? ""
				const isUnsubscribe = /unsubscribe/i.test(element.getAttribute("rel") ?? "")
				anchorText = ""
				element.onEndTag(() => {
					const candidate = personalSourcesCandidateUrl.safeParse(href)
					if (
						candidate.success &&
						(isUnsubscribe || /unsubscribe|opt out|manage (?:email )?preferences/i.test(anchorText))
					) {
						excludedLinks.add(candidate.data)
						hasNewsletterMarker = true
					} else {
						addLink(href)
					}
				})
			},
			text: (chunk) => {
				anchorText += chunk.text
			},
		})
		.transform(html)
	return { links: [...links].filter((url) => !excludedLinks.has(url)), hasNewsletterMarker }
}
