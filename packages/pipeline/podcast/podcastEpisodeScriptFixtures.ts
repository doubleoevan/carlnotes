// fixtures that the podcast episode script tests share: an outline of two Findings, an outline of given Findings,
// and a text of a given number of words
import type { PodcastEpisodeOutline } from "./podcastEpisodeOutline"

// an outline that plans both Findings in one segment
export const outline: PodcastEpisodeOutline = {
	title: "A quieter grinder, and your water",
	description: "A quieter burr set, and why hard water sours a shot.",
	segments: [
		{
			theme: "gear and water",
			chapters: [
				{ findingId: "finding-1", minutes: 2 },
				{ findingId: "finding-2", minutes: 1 },
			],
		},
	],
}

/**
 * Returns an outline of one segment that plans the given Findings, two minutes each.
 */
export function toOutline(findingIds: string[]): PodcastEpisodeOutline {
	const chapters = findingIds.map((findingId) => ({ findingId, minutes: 2 }))
	return { ...outline, segments: [{ theme: "gear and water", chapters }] }
}

/**
 * Returns a text of the given number of words.
 */
export function toWords(wordCount: number): string {
	return Array.from({ length: wordCount }, () => "word").join(" ")
}
