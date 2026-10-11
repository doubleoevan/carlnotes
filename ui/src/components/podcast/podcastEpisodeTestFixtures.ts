// a published podcast episode's summary for the ui tests, as a table row and its play button read it
import type { PodcastEpisodeSummary } from "@shared/contracts/podcast"

/**
 * Returns a published podcast episode's summary with twelve chapters, with any of its fields replaced.
 */
export function toPodcastEpisodeSummaryFixture(
	podcastEpisodeSummaryFields: Partial<PodcastEpisodeSummary> = {},
): PodcastEpisodeSummary {
	return {
		id: "episode-1",
		title: "Robot vacuums, ranked",
		description: "Six robot vacuums, ranked by how well they find the corners.",
		season: 2026,
		episodeNumber: 7,
		durationSeconds: 600,
		publishedAt: "2026-10-01T00:00:00.000Z",
		pagePath: "/topics/topic-1/robots/episodes/2026/7",
		chapterCount: 12,
		...podcastEpisodeSummaryFields,
	}
}
