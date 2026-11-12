// the text helpers that every module shares

// the words a reader gets through in a minute, which a Finding's and a Topic Post's reading times share
export const READING_WORDS_PER_MINUTE = 250

/**
 * Returns text on one line, with each run of whitespace, line breaks included, as one space and none at either end.
 */
export function toOneLineText(text: string): string {
	return text.replace(/\s+/g, " ").trim()
}

/**
 * Returns text cut to a length, with an ellipsis as its last character if the cut removed any.
 */
export function toCutText(text: string, maxChars: number): string {
	return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text
}

// the HTML entities a page or a sanitized body is likely to write, and the numeric form that names any character by
// its code point
const HTML_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: "\u00a0",
	mdash: "\u2014",
	ndash: "\u2013",
	hellip: "\u2026",
	rsquo: "\u2019",
	lsquo: "\u2018",
	ldquo: "\u201c",
	rdquo: "\u201d",
}
const HTML_ENTITY_PATTERN = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi

/**
 * Returns the text with its entities read as the characters they name. An entity naming none stays as written.
 */
export function toDecodedHtmlEntities(text: string): string {
	return text.replace(HTML_ENTITY_PATTERN, (entity, entityName: string) => toEntityCharacter(entityName) ?? entity)
}

// the character an entity names, or null if it names none
function toEntityCharacter(entityName: string): string | null {
	// a name is looked up, and the numeric forms name a code point in decimal or in hex
	if (!entityName.startsWith("#")) {
		return HTML_ENTITIES[entityName.toLowerCase()] ?? null
	}
	const isHexadecimal = entityName[1]?.toLowerCase() === "x"
	const codePoint = isHexadecimal ? Number.parseInt(entityName.slice(2), 16) : Number(entityName.slice(1))

	// a code point outside the range, or one naming half a surrogate pair, is not a character to write
	const isCharacter =
		Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff)
	return isCharacter ? String.fromCodePoint(codePoint) : null
}

/**
 * Returns an html body's readable text: its tags dropped with a space in their place, its entities decoded, and its
 * whitespace collapsed. A link keeps its text and loses its url.
 */
export function toHtmlText(html: string): string {
	return toOneLineText(toDecodedHtmlEntities(html.replace(/<[^>]*>/g, " ")))
}

/**
 * Returns the parts on one line, joined by middle dots, leaving out the empty ones.
 */
export function toDotSeparatedText(parts: (string | null | undefined)[]): string {
	return parts.filter(Boolean).join(" · ")
}

/**
 * Returns a regular noun for a count, singular if the count is one and plural otherwise, without the count.
 */
export function toCountNoun(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`
}

/**
 * Returns a count with its noun, singular if the count is one.
 */
export function toCountLabel(count: number, noun: string): string {
	return `${count.toLocaleString()} ${toCountNoun(count, noun)}`
}
