// the podcast episode film backfill: one workflow that gives each Topic's latest podcast episode a film and renders
// every ready film below the current render version again, a few at a time, on the platform's bill. each render is a
// child workflow under the film's own id, on the backfill's queue, and waits while a new film waits for a film Worker.
// a second start joins the one running, and a run with nothing to render ends at once. the workflow name must not
// change, because a backfill under way replays it by name

import { toChunks } from "@carlnotes/contracts/arrays"
import { isWorkflowAlreadyStarted, toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import {
	TOPIC_VIDEO_WORKFLOW,
	type TopicVideoBackfillSummary,
	toTopicVideoWorkflowId,
} from "@carlnotes/contracts/topicVideoWork"
import type { RenderTopicVideoResult } from "@carlnotes/pipeline/topicVideo/renderTopicVideo"
import { continueAsNew, executeChild, isCancellation, log, patched, proxyActivities, sleep } from "@temporalio/workflow"
import type * as backfillActivities from "./backfillTopicVideosActivities"
import { TOPIC_VIDEO_RENDER_OPTIONS, type TopicVideoWorkflowInput } from "./renderTopicVideo"
import type * as renderActivities from "./renderTopicVideoActivities"

// the backfill's Worker runs each film's render workflow as the backfill's child, so its bundle holds that workflow too
export { renderTopicPodcastEpisodeVideoWorkflow } from "./renderTopicVideo"

// how many Topics or films one run of the workflow takes before it continues as a new run
const BACKFILL_PAGE_SIZE = 100

// the listing and the failure mark are short
const WRITE_TIMEOUT_MS = 2 * 60 * 1000
const WRITE_ATTEMPTS = 3

// the listing and the read of the new films' queue may retry
const { listBackfillPodcastEpisodeIds, canUpgradeSelectedTopicVideo, hasWaitingNewTopicVideo } = proxyActivities<
	typeof backfillActivities
>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// the render of a backfill from before its renders were child workflows. it works on temp files and starts over on a
// retry
const { renderTopicPodcastEpisodeVideoActivity } = proxyActivities<typeof renderActivities>(TOPIC_VIDEO_RENDER_OPTIONS)

// the failure mark of such a backfill may retry
const { markTopicPodcastEpisodeVideoFailedActivity } = proxyActivities<typeof renderActivities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// a backfill from before its renders were child workflows renders through its own activities
const CHILD_RENDER_PATCH = "topic-video-backfill-child-renders"

// a backfill from before it waited for new films renders beside them
const NEW_FILM_WAIT_PATCH = "topic-video-backfill-new-film-wait"

// how long the backfill waits before it reads the new films' queue again
const NEW_FILM_WAIT_MS = 60 * 1000

// the counts of a backfill that has rendered nothing yet
const EMPTY_BACKFILL_SUMMARY: TopicVideoBackfillSummary = {
	renderedCount: 0,
	skippedCount: 0,
	failedCount: 0,
	generatedChapterImageCount: 0,
	renderSeconds: 0,
	byteSize: 0,
}

// the backfill's input: how many films render at once, and on a continued run when the backfill started, the page
// cursor, and the counts so far
export type BackfillTopicVideosWorkflowInput = {
	concurrency: number
	selectedEpisodeId?: string
	startedAt?: string
	afterCursor?: backfillActivities.BackfillTopicVideoCursor
	summary?: TopicVideoBackfillSummary
}

/**
 * Renders a film for each Topic's latest podcast episode that has none, then renders every ready film below the
 * current render version again, public Topics first, a few at a time. Logs its counts and the podcast episodes left
 * after each batch, and returns what it did.
 */
export async function backfillTopicPodcastEpisodeVideosWorkflow({
	concurrency,
	selectedEpisodeId,
	startedAt = new Date().toISOString(),
	afterCursor,
	summary = EMPTY_BACKFILL_SUMMARY,
}: BackfillTopicVideosWorkflowInput): Promise<TopicVideoBackfillSummary> {
	// read each patch once at the top of the run, so a backfill that started before a step existed finishes its page as
	// it began
	const isChildRender = patched(CHILD_RENDER_PATCH)
	const isNewFilmWaitedFor = patched(NEW_FILM_WAIT_PATCH)

	// A manual upgrade only takes a ready episode, and gives the live queue first choice of capacity.
	if (selectedEpisodeId) {
		const eligible = await canUpgradeSelectedTopicVideo(selectedEpisodeId)
		return addBackfillOutcome(
			EMPTY_BACKFILL_SUMMARY,
			eligible
				? await runBackfillRender({ podcastEpisodeId: selectedEpisodeId, renderVersion: 4, isChildRender })
				: { outcome: "skipped" },
		)
	}
	// one page of podcast episodes, public Topics first. a continued run's summary with no generated image count gets
	// zero
	const podcastEpisodePage = await listBackfillPodcastEpisodeIds({ startedAt, afterCursor, limit: BACKFILL_PAGE_SIZE })
	let pageSummary = { ...EMPTY_BACKFILL_SUMMARY, ...summary }

	// the first run logs what the whole backfill has to render and what that is estimated to cost the platform
	if (!afterCursor) {
		log.info("film backfill started", toBackfillWorkLeft(podcastEpisodePage, 0))
	}

	// render the podcast episodes a few at a time, adding each outcome to the counts
	const { podcastEpisodeIds } = podcastEpisodePage
	let attemptedPodcastEpisodeCount = 0
	for (const batchPodcastEpisodeIds of toChunks(podcastEpisodeIds, concurrency)) {
		// a new podcast episode's film goes first, so the batch starts once none waits for a film Worker
		if (isNewFilmWaitedFor) {
			await waitForNewTopicVideos()
		}
		const backfillOutcomes = await Promise.all(
			batchPodcastEpisodeIds.map((podcastEpisodeId) => runBackfillRender({ podcastEpisodeId, isChildRender })),
		)
		pageSummary = backfillOutcomes.reduce(addBackfillOutcome, pageSummary)

		// log the counts so far, how many podcast episodes the backfill has left, and their estimated cost
		attemptedPodcastEpisodeCount += batchPodcastEpisodeIds.length
		const backfillWorkLeft = toBackfillWorkLeft(podcastEpisodePage, attemptedPodcastEpisodeCount)
		log.info("film backfill progress", { ...pageSummary, ...backfillWorkLeft })
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

// what the backfill has left: how many podcast episodes, and what rendering them is estimated to cost the platform
type BackfillWorkLeft = { remainingPodcastEpisodeCount: number; estimatedRemainingCostDollars: number }

// what the backfill has left once it has attempted some of a page's podcast episodes. the page's estimate shrinks with
// the podcast episodes left, and a page listed by a worker from before the estimate has none
function toBackfillWorkLeft(
	{
		remainingPodcastEpisodeCount = 0,
		estimatedRemainingCostDollars = 0,
	}: backfillActivities.BackfillPodcastEpisodePage,
	attemptedPodcastEpisodeCount: number,
): BackfillWorkLeft {
	const podcastEpisodesLeftCount = Math.max(0, remainingPodcastEpisodeCount - attemptedPodcastEpisodeCount)
	const shareLeft = remainingPodcastEpisodeCount > 0 ? podcastEpisodesLeftCount / remainingPodcastEpisodeCount : 0
	return {
		remainingPodcastEpisodeCount: podcastEpisodesLeftCount,
		estimatedRemainingCostDollars: Math.round(estimatedRemainingCostDollars * shareLeft * 100) / 100,
	}
}

// what one backfill render did
type BackfillOutcome =
	| { outcome: "rendered"; renderSeconds: number; byteSize: number; generatedChapterImageCount?: number }
	| { outcome: "skipped" }
	| { outcome: "failed" }

// wait while a new podcast episode's film waits for a film Worker. a read that fails every attempt lets the
// backfill go on
async function waitForNewTopicVideos(): Promise<void> {
	while (await hasWaitingNewTopicVideo().catch(() => false)) {
		await sleep(NEW_FILM_WAIT_MS)
	}
}

// the podcast episode, the render version of a selected render, and whether the render runs as a child workflow
type BackfillRender = { podcastEpisodeId: string; renderVersion?: 4; isChildRender: boolean }

// render one podcast episode's film on the platform's bill, as a child workflow under the film's own id. a film whose
// render is already queued or running is skipped, because Temporal rejects a second workflow with its id. a render
// that fails every attempt is marked failed by its own workflow, and a ready film whose render failed keeps playing
async function runBackfillRender({
	podcastEpisodeId,
	renderVersion,
	isChildRender,
}: BackfillRender): Promise<BackfillOutcome> {
	if (!isChildRender) {
		return runBackfillRenderActivity(podcastEpisodeId, renderVersion)
	}
	try {
		// the film's workflow on the backfill's own queue, so the render takes a backfill slot
		const renderWorkflowInput: TopicVideoWorkflowInput = {
			podcastEpisodeId,
			isPlatformBilled: true,
			...(renderVersion ? { renderVersion } : {}),
		}
		const renderResult = await executeChild<(input: TopicVideoWorkflowInput) => Promise<RenderTopicVideoResult>>(
			TOPIC_VIDEO_WORKFLOW,
			{ workflowId: toTopicVideoWorkflowId(podcastEpisodeId), args: [renderWorkflowInput] },
		)
		return renderResult.outcome === "rendered" ? renderResult : { outcome: "skipped" }
	} catch (error) {
		// a cancelled backfill stops here, after its child has settled its own row
		if (isCancellation(error)) {
			throw error
		}
		return { outcome: isWorkflowAlreadyStarted(error) ? "skipped" : "failed" }
	}
}

// render one podcast episode's film through the backfill's own activities, as a backfill from before the child
// workflows does. a render that fails every attempt is marked failed, so no later listing finds it again
async function runBackfillRenderActivity(podcastEpisodeId: string, renderVersion?: 4): Promise<BackfillOutcome> {
	try {
		const renderResult = await renderTopicPodcastEpisodeVideoActivity({
			podcastEpisodeId,
			isPlatformBilled: true,
			...(renderVersion ? { renderVersion } : {}),
		})
		return renderResult.outcome === "rendered" ? renderResult : { outcome: "skipped" }
	} catch (error) {
		// a cancelled backfill stops here. any other failure is marked and counted, and the backfill moves on
		if (isCancellation(error)) {
			throw error
		}
		await markTopicPodcastEpisodeVideoFailedActivity({
			podcastEpisodeId,
			reason: toWorkflowFailureReason(error),
			...(renderVersion ? { renderVersion } : {}),
		})
		return { outcome: "failed" }
	}
}

// add one render's outcome to the counts
function addBackfillOutcome(
	summary: TopicVideoBackfillSummary,
	backfillOutcome: BackfillOutcome,
): TopicVideoBackfillSummary {
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
