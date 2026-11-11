// how long a Finding's Resource takes: a read from its stored size, a watch or listen from its stored duration

import type { TopicFinding } from "@carlnotes/contracts/findings"
import { READING_WORDS_PER_MINUTE } from "@carlnotes/contracts/text"

// the average English word's bytes with its space
const BYTES_PER_WORD = 6

// the minutes of a Resource that stored neither its size nor its duration
const UNKNOWN_MINUTES_BY_KIND: Record<TopicFinding["resourceKind"], number> = {
	read: 5,
	watch: 10,
	listen: 30,
	unknown: 5,
}

// the stored lengths of a Resource, by its kind
type ResourceLength = {
	resourceKind: TopicFinding["resourceKind"]
	contentBytes: number | null
	durationSeconds: number | null
}

/**
 * Returns the minutes a Resource takes. A read is at least one minute, and a missing length reads as its kind's estimate.
 */
export function toReadingMinutes({ resourceKind, contentBytes, durationSeconds }: ResourceLength): number {
	// a read counts its words
	if (resourceKind === "read") {
		return contentBytes
			? Math.max(1, contentBytes / BYTES_PER_WORD / READING_WORDS_PER_MINUTE)
			: UNKNOWN_MINUTES_BY_KIND.read
	}

	// a watch or listen counts its duration
	return durationSeconds ? durationSeconds / 60 : UNKNOWN_MINUTES_BY_KIND[resourceKind]
}
