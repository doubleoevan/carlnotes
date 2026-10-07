// the percentage label and word count that the evals share

/**
 * Returns a ratio as a whole-number percentage.
 */
export function toPercentLabel(ratio: number): string {
	return `${Math.round(ratio * 100)}%`
}

/**
 * Returns how many words the text has, split on whitespace.
 */
export function toWordCount(text: string): number {
	return text.split(/\s+/).filter(Boolean).length
}
