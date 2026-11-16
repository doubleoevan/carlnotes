// shared fictional Journal pages for Nightshift on web and Expo
import type { TopicMemoriesPage } from "@carlnotes/contracts/topicMemories"

export const TAKEAWAY_STORY_TEXT = "A coarser grind can reduce bitterness in a slow pour-over."
export const TAKEAWAY_STORY_CORRECTION = "This applies to the slow pour-over recipe from E3."

/** Provides the same ordered pages to the web and Expo component stories. */
export function toTopicMemoryStoryPage({
	page = 1,
	canRate = true,
	isEmpty = false,
}: {
	page?: number
	canRate?: boolean
	isEmpty?: boolean
} = {}): TopicMemoriesPage {
	return {
		canRate,
		pageCount: isEmpty ? 0 : 2,
		items: isEmpty
			? []
			: [
					{
						id: `takeaway-${page}`,
						kind: "fact",
						text: page === 1 ? TAKEAWAY_STORY_TEXT : "Cafés are using more low-caffeine blends.",
						firstScanAt: "2026-11-12T12:00:00.000Z",
						episodeNumber: page === 1 ? 3 : null,
						note: null,
						rating: null,
					},
				],
	}
}
