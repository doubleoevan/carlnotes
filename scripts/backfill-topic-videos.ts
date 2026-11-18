// starts the film backfill on the worker's Temporal, or joins the one running, and waits for its summary. run under
// doppler: bun run films:backfill
import { parseArgs } from "node:util"
import { startTopicVideoBackfillWorkflow } from "@carlnotes/pipeline/temporalClient"
import { isTopicVideoBackfillEnabled, topicVideoBackfillConcurrency } from "@carlnotes/server/podcastEpisodeSettings"
import { z } from "zod"

// start no backfill while films or the backfill are off, where a concurrency of zero would never finish a batch
if (!isTopicVideoBackfillEnabled()) {
	console.log("film backfill: off. TOPIC_VIDEO_CONCURRENCY or TOPIC_VIDEO_BACKFILL_CONCURRENCY is 0")
	process.exit(0)
}

// A named episode is the only route to an optional animation upgrade.
const { values } = parseArgs({ args: process.argv.slice(2), options: { episode: { type: "string" } }, strict: true })
const selectedEpisodeId = values.episode === undefined ? undefined : z.uuid().parse(values.episode)
// start or join the backfill, and wait for what it did
const topicVideoBackfillStart = await startTopicVideoBackfillWorkflow(
	topicVideoBackfillConcurrency(),
	selectedEpisodeId,
)
const { renderedCount, skippedCount, failedCount, generatedChapterImageCount, renderSeconds, byteSize } =
	await topicVideoBackfillStart.whenFinished()

// print the summary, and fail the run if a film failed
console.log(
	`film backfill: ${renderedCount} rendered, ${skippedCount} skipped, ${failedCount} failed, ` +
		`${generatedChapterImageCount} generated images drawn, ${Math.round(renderSeconds)}s of render time, ` +
		`${(byteSize / 1_000_000).toFixed(1)} MB stored`,
)
process.exit(failedCount > 0 ? 1 : 0)
