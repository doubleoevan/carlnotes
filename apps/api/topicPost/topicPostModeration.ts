// a Topic Post's moderation: the texts a reader sees in its body, and the classification of a title and those texts
import { toHtmlText } from "@carlnotes/contracts/text"
import { MODERATION_TEXT_MAX_CHARS } from "@carlnotes/models/moderation"
import { toObjectionableCategory } from "../moderation"

// the end of each block in a body's html, where one paragraph's text stops
const BLOCK_END_PATTERN = /<\/(?:p|h[1-6]|li|blockquote|codeblock)>|<br\s*\/?>/i

// an image's alt text in the sanitized html, which always quotes it with double quotes
const ALT_TEXT_PATTERN = /\salt="([^"]*)"/g

/**
 * Returns the texts a reader sees in a Topic Post's body: each paragraph's text, and each image's alt text after the
 * paragraph it sits in.
 */
export function toTopicPostModerationTexts(html: string): string[] {
	return html
		.split(BLOCK_END_PATTERN)
		.flatMap((blockHtml) => [
			toHtmlText(blockHtml),
			...[...blockHtml.matchAll(ALT_TEXT_PATTERN)].map(([, altText = ""]) => toHtmlText(altText)),
		])
		.filter(Boolean)
}

/**
 * Returns the category that a Topic Post's texts violate, or null. The texts are joined and classified in pieces of
 * the classification's limit, in order, up to the first violation.
 */
export async function toObjectionableTopicPostCategory(
	texts: string[],
	topicPostId: string,
): ReturnType<typeof toObjectionableCategory> {
	const text = texts.join("\n\n")
	for (let pieceStart = 0; pieceStart < text.length; pieceStart += MODERATION_TEXT_MAX_CHARS) {
		// classify one piece, and stop at a violation
		const objectionableCategory = await toObjectionableCategory({
			text: text.slice(pieceStart, pieceStart + MODERATION_TEXT_MAX_CHARS),
			textKind: "a public post about a topic",
			subjectKind: "topicPost",
			subjectId: topicPostId,
		})
		if (objectionableCategory) {
			return objectionableCategory
		}
	}
	return null
}
