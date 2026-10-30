// the text of a thrown value

/**
 * Returns a thrown value's text: an error's message, or the value as a string.
 */
export function toErrorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
