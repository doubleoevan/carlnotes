// a published podcast episode's row for the api tests, in the order that podcastEpisodeColumns selects
import { toSelectionRow } from "../../db/connectionPoolStub"
import { podcastEpisodeColumns } from "./podcastEpisodeRows"

/**
 * Returns a published podcast episode's row in podcastEpisodeColumns' order, with any of its fields replaced.
 */
export function toPublishedPodcastEpisodeRow(podcastEpisodeFields: Record<string, unknown>): unknown[] {
	return toSelectionRow(podcastEpisodeColumns, {
		scanId: "scan-1",
		status: "published",
		season: 2026,
		episodeNumber: 3,
		audioKey: "audio-key",
		audioByteSize: 1000,
		durationSeconds: 1440,
		publishedAt: "2026-10-03T12:00:00.000Z",
		...podcastEpisodeFields,
	})
}
