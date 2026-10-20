// the percentage label, word count, writing cost label, and tool names label that the evals share

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

/**
 * Returns what a run cost to write, in dollars to four places, or $0.0000 if promptfoo reported no cost.
 */
export function toWriteCostLabel(costDollars: number | undefined): string {
	return `$${(costDollars ?? 0).toFixed(4)} to write`
}

/**
 * Returns the tools a chat turn called, in order, or none.
 */
export function toToolNamesLabel(toolNames: string[]): string {
	return `tools: ${toolNames.join(", ") || "none"}`
}
