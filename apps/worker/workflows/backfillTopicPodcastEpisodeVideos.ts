// the podcast episode film backfill: one workflow that gives each Topic's latest podcast episode a film and renders
// every ready film below the current render version again, a few at a time, on the platform's bill. a second start
// joins the one running, and a run with nothing to render ends at once

import { toChunks } from "@carlnotes/contracts/arrays"
import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import type { TopicPodcastEpisodeVideoBackfillSummary } from "@carlnotes/contracts/topicPodcastEpisodeVideoWork"
import { continueAsNew, isCancellation, log, proxyActivities } from "@temporalio/workflow"
import type * as backfillActivities from "./backfillTopicPodcastEpisodeVideosActivities"
import { TOPIC_PODCAST_EPISODE_VIDEO_RENDER_OPTIONS } from "./renderTopicPodcastEpisodeVideo"
import type * as renderActivities from "./renderTopicPodcastEpisodeVideoActivities"

// how many Topics or films one run of the workflow takes before it continues as a new run
const BACKFILL_PAGE_SIZE = 100

// the listing and the failure mark are short
const WRITE_TIMEOUT_MS = 2 * 60 * 1000
const WRITE_ATTEMPTS = 3

// the listing may retry
const { listBackfillPodcastEpisodeIds } = proxyActivities<typeof backfillActivities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// the render works on temp files and starts over on a retry
const { renderTopicPodcastEpisodeVideoActivity } = proxyActivities<typeof renderActivities>(
	TOPIC_PODCAST_EPISODE_VIDEO_RENDER_OPTIONS,
)

// the failure mark may retry
const { markTopicPodcastEpisodeVideoFailedActivity } = proxyActivities<typeof renderActivities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// the counts of a backfill that has rendered nothing yet
const EMPTY_BACKFILL_SUMMARY: TopicPodcastEpisodeVideoBackfillSummary = {
	renderedCount: 0,
	skippedCount: 0,
	failedCount: 0,
	generatedChapterImageCount: 0,
	renderSeconds: 0,
	byteSize: 0,
}

// the backfill's input: how many films render at once, and on a continued run when the backfill started, the page
// cursor, and the counts so far
export type BackfillTopicPodcastEpisodeVideosWorkflowInput = {
	concurrency: number
	startedAt?: string
	afterCursor?: backfillActivities.BackfillTopicPodcastEpisodeVideoCursor
	summary?: TopicPodcastEpisodeVideoBackfillSummary
}

/**
 * Renders a film for each Topic's latest podcast episode that has none, then renders every ready film below the
 * current render version again, public Topics first, a few at a time. Logs its counts and the podcast episodes left
 * after each batch, and returns what it did.
 */
export async function backfillTopicPodcastEpisodeVideosWorkflow({
	concurrency,
	startedAt = new Date().toISOString(),
	afterCursor,
	summary = EMPTY_BACKFILL_SUMMARY,
}: BackfillTopicPodcastEpisodeVideosWorkflowInput): Promise<TopicPodcastEpisodeVideoBackfillSummary> {
	// one page of podcast episodes, public Topics first. a continued run's summary with no generated image count gets zero
	const podcastEpisodePage = await listBackfillPodcastEpisodeIds({ startedAt, afterCursor, limit: BACKFILL_PAGE_SIZE })
	let pageSummary = { ...EMPTY_BACKFILL_SUMMARY, ...summary }

	// render the podcast episodes a few at a time, adding each outcome to the counts
	const { podcastEpisodeIds } = podcastEpisodePage
	let attemptedPodcastEpisodeCount = 0
	for (const batchPodcastEpisodeIds of toChunks(podcastEpisodeIds, concurrency)) {
		const backfillOutcomes = await Promise.all(batchPodcastEpisodeIds.map(runBackfillRender))
		pageSummary = backfillOutcomes.reduce(addBackfillOutcome, pageSummary)

		// log the counts so far, and how many podcast episodes the backfill has left
		attemptedPodcastEpisodeCount += batchPodcastEpisodeIds.length
		const remainingPodcastEpisodeCount = Math.max(
			0,
			(podcastEpisodePage.remainingPodcastEpisodeCount ?? 0) - attemptedPodcastEpisodeCount,
		)
		log.info("film backfill progress", { ...pageSummary, remainingPodcastEpisodeCount })
	}

	// a full page means more may follow, so the next run picks up after this page's last Topic or film
	if (podcastEpisodePage.nextCursor) {
		await continueAsNew<typeof backfillTopicPodcastEpisodeVideosWorkflow>({
			concurrency,
			startedAt,
			afterCursor: podcastEpisodePage.nextCursor,
			summary: pageSummary,
		})
	}

	// the last page logs the summary to the worker's log
	log.info("film backfill finished", pageSummary)
	return pageSummary
}

// what one backfill render did
type BackfillOutcome =
	| { outcome: "rendered"; renderSeconds: number; byteSize: number; generatedChapterImageCount?: number }
	| { outcome: "skipped" }
	| { outcome: "failed" }

// render one podcast episode's film on the platform's bill. a render that fails every attempt is marked failed, so no
// later listing finds it again. a ready film whose render failed keeps playing
async function runBackfillRender(podcastEpisodeId: string): Promise<BackfillOutcome> {
	try {
		const renderResult = await renderTopicPodcastEpisodeVideoActivity({ podcastEpisodeId, isPlatformBilled: true })
		return renderResult.outcome === "rendered" ? renderResult : { outcome: "skipped" }
	} catch (error) {
		// a cancelled backfill stops here. any other failure is marked and counted, and the backfill moves on
		if (isCancellation(error)) {
			throw error
		}
		await markTopicPodcastEpisodeVideoFailedActivity({ podcastEpisodeId, reason: toWorkflowFailureReason(error) })
		return { outcome: "failed" }
	}
}

// add one render's outcome to the counts
function addBackfillOutcome(
	summary: TopicPodcastEpisodeVideoBackfillSummary,
	backfillOutcome: BackfillOutcome,
): TopicPodcastEpisodeVideoBackfillSummary {
	// a skip or a failure counts once
	if (backfillOutcome.outcome === "skipped") {
		return { ...summary, skippedCount: summary.skippedCount + 1 }
	}
	if (backfillOutcome.outcome === "failed") {
		return { ...summary, failedCount: summary.failedCount + 1 }
	}

	// a rendered film adds its generated images, its time, and its bytes
	return {
		...summary,
		renderedCount: summary.renderedCount + 1,
		generatedChapterImageCount: summary.generatedChapterImageCount + (backfillOutcome.generatedChapterImageCount ?? 0),
		renderSeconds: summary.renderSeconds + backfillOutcome.renderSeconds,
		byteSize: summary.byteSize + backfillOutcome.byteSize,
	}
}
