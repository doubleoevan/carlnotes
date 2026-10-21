// the text helpers that every module shares

/**
 * Returns text on one line, with each run of whitespace, line breaks included, as one space and none at either end.
 */
export function toOneLineText(text: string): string {
	return text.replace(/\s+/g, " ").trim()
}
