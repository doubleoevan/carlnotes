// text a user wrote, as an email quotes it: written so that no mail client turns part of it into a link
import { toCutText, toOneLineText } from "@carlnotes/contracts/text"

// a url of any scheme and host, an ip address, or a bare domain or the domain of an email address in any script
const LINK_LIKE_PATTERN =
	/[a-z][a-z0-9+.-]*:\/\/\S+|\b\d{1,3}(?:\.\d{1,3}){3}\b|(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}(?:[/?#]\S*)?/giu

/**
 * Returns text with every url, address, and domain in it written with bracketed dots, as in example[.]org, so a mail client
 * shows it as text. The words are otherwise unchanged.
 */
export function toUnlinkedText(text: string): string {
	return text.replace(LINK_LIKE_PATTERN, (linkLikeText) =>
		linkLikeText.replaceAll("://", "[://]").replaceAll(".", "[.]"),
	)
}

/**
 * Returns a quote of a user's text for an email: on one line, cut to a length with an ellipsis, and unlinked.
 */
export function toEmailQuote(text: string, maxChars: number): string {
	return toUnlinkedText(toCutText(toOneLineText(text), maxChars))
}
