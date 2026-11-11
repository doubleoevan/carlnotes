// starts the film backfill on the worker's Temporal, or joins the one running, and waits for its summary. run under
// doppler: bun run films:backfill
import { startTopicPodcastEpisodeVideoBackfillWorkflow } from "@carlnotes/pipeline/temporalClient"
import { topicPodcastEpisodeVideoBackfillConcurrency } from "@carlnotes/server/podcastEpisodeSettings"

// start or join the backfill, and wait for what it did
const topicPodcastEpisodeVideoBackfillStart = await startTopicPodcastEpisodeVideoBackfillWorkflow(
	topicPodcastEpisodeVideoBackfillConcurrency(),
)
const { renderedCount, skippedCount, failedCount, renderSeconds, byteSize } =
	await topicPodcastEpisodeVideoBackfillStart.whenFinished()

// print the summary, and fail the run if a film failed
console.log(
	`film backfill: ${renderedCount} rendered, ${skippedCount} skipped, ${failedCount} failed, ` +
		`${Math.round(renderSeconds)}s of render time, ${(byteSize / 1_000_000).toFixed(1)} MB stored`,
)
process.exit(failedCount > 0 ? 1 : 0)
