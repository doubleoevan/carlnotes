// draws an image for every published podcast episode that has none, on the platform's key. run under doppler:
// bun run podcast-episode-images:backfill
import {
	drawPodcastEpisodeImage,
	loadPodcastEpisodeIdsWithoutImage,
} from "@carlnotes/pipeline/podcast/podcastEpisodeImage"
import { runWithConcurrency } from "@carlnotes/server/concurrency"

// how many podcast episodes draw at once
const DRAW_CONCURRENCY = 4

// the podcast episodes to draw, each drawn on its own
const podcastEpisodeIds = await loadPodcastEpisodeIdsWithoutImage()
const failedPodcastEpisodeIds: string[] = []
await runWithConcurrency(podcastEpisodeIds, DRAW_CONCURRENCY, async (podcastEpisodeId) => {
	await drawPodcastEpisodeImage({ podcastEpisodeId, isPlatformBilled: true }).catch((error: unknown) => {
		console.error(`podcast episode ${podcastEpisodeId}: ${error instanceof Error ? error.message : String(error)}`)
		failedPodcastEpisodeIds.push(podcastEpisodeId)
	})
})

// the summary, and a failing exit if any podcast episode failed
console.log(
	`podcast episode image backfill: ${podcastEpisodeIds.length} podcast episodes, ${failedPodcastEpisodeIds.length} failed`,
)
process.exit(failedPodcastEpisodeIds.length > 0 ? 1 : 0)
