// starts the film backfill on the worker's Temporal, or joins the one running, and waits for its summary. run under
// doppler: bun run films:backfill
import { startTopicPodcastEpisodeVideoBackfillWorkflow } from "@carlnotes/pipeline/temporalClient"
import {
	isTopicPodcastEpisodeVideoBackfillEnabled,
	topicPodcastEpisodeVideoBackfillConcurrency,
} from "@carlnotes/server/podcastEpisodeSettings"

// start no backfill while films or the backfill are off, where a concurrency of zero would never finish a batch
if (!isTopicPodcastEpisodeVideoBackfillEnabled()) {
	console.log(
		"film backfill: off. TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY or TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY is 0",
	)
	process.exit(0)
}

// start or join the backfill, and wait for what it did
const topicPodcastEpisodeVideoBackfillStart = await startTopicPodcastEpisodeVideoBackfillWorkflow(
	topicPodcastEpisodeVideoBackfillConcurrency(),
)
const { renderedCount, skippedCount, failedCount, generatedChapterImageCount, renderSeconds, byteSize } =
	await topicPodcastEpisodeVideoBackfillStart.whenFinished()

// print the summary, and fail the run if a film failed
console.log(
	`film backfill: ${renderedCount} rendered, ${skippedCount} skipped, ${failedCount} failed, ` +
		`${generatedChapterImageCount} generated images drawn, ${Math.round(renderSeconds)}s of render time, ` +
		`${(byteSize / 1_000_000).toFixed(1)} MB stored`,
)
process.exit(failedCount > 0 ? 1 : 0)
