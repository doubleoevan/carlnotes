// the rule a suggested reply passes before a composer shows it: one short line that holds nothing that could reach
// someone or name a place to read

import { SUGGESTED_REPLY_CHARS } from "./chat"

// an at sign anywhere, which covers an email address and an account handle, a web address with a scheme or www, and
// any dotted name that ends in letters, which covers a bare domain under any top-level domain
const AT_SIGN_PATTERN = /@/
const URL_PATTERN = /\b(?:[a-z][a-z0-9+.-]*:\/|www\.)/i
const DOMAIN_PATTERN = /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/u

/**
 * Returns the suggestion with its whitespace collapsed, or null for one that is empty, past the length a composer
 * shows, or that holds an email, a web address, a dotted name, or an account handle.
 */
export function toSafeSuggestedReply(suggestedReply: string | null | undefined): string | null {
	// one line, inside the composer's limit, with a lookalike such as a fullwidth at sign folded to its plain form first
	const text = suggestedReply?.normalize("NFKC").replace(/\s+/g, " ").trim() ?? ""
	if (!text || text.length > SUGGESTED_REPLY_CHARS) {
		return null
	}

	// a line that could reach someone, or name a place to read, is never suggested
	const isUnsafe = [AT_SIGN_PATTERN, URL_PATTERN, DOMAIN_PATTERN].some((pattern) => pattern.test(text))
	return isUnsafe ? null : text
}
