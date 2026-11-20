// the durable podcast episode recording. plan, outline, one script call per segment, one speech call per chapter, encode,
// and publish. a succeeded Scan starts the recording as a child workflow that outlives the scan workflow

// a relative import. temporal bundles workflow code with webpack, which has no @shared alias
import {
	PODCAST_EPISODE_ENCODE_TASK_QUEUE,
	PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
} from "@carlnotes/contracts/podcastEpisodeWork"
import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import {
	TOPIC_VIDEO_TASK_QUEUE,
	TOPIC_VIDEO_WORKFLOW,
	toTopicVideoWorkflowId,
} from "@carlnotes/contracts/topicVideoWork"
import type { SpeechTier } from "@carlnotes/models/budget"
// the timeouts and retry policies of this workflow's activities, which the reaper's limit is derived from
import {
	FLEX_CHAPTER_TIMEOUT_MS,
	FLEX_CHAPTER_TOTAL_TIMEOUT_MS,
	HEARTBEAT_TIMEOUT_MS,
	PODCAST_CHAPTER_RETRY_POLICY,
	PODCAST_ENCODE_ATTEMPTS,
	PODCAST_ENCODE_TIMEOUT_MS,
	PODCAST_IMAGE_RETRY_POLICY,
	PODCAST_IMAGE_TIMEOUT_MS,
	PODCAST_SCRIPT_TIMEOUT_MS,
	PODCAST_SCRIPT_TOTAL_TIMEOUT_MS,
	PODCAST_WRITE_ATTEMPTS,
	PODCAST_WRITE_TIMEOUT_MS,
	STANDARD_CHAPTER_TIMEOUT_MS,
	STANDARD_CHAPTER_TOTAL_TIMEOUT_MS,
} from "@carlnotes/pipeline/stageTimeouts"
import type { RecordPodcastEpisodeWorkflowInput } from "@carlnotes/pipeline/temporalClient"
import {
	getExternalWorkflowHandle,
	ParentClosePolicy,
	patched,
	proxyActivities,
	startChild,
} from "@temporalio/workflow"
import type * as podcastEpisodeActivities from "./recordPodcastEpisodeActivities"
import { podcastEpisodeOutlineSettledSignal } from "./sendScanEmail"

// the Topic Post Discussion's recording runs on this same queue, and one bundle holds both workflows
export { recordTopicPostDiscussionWorkflow } from "./recordTopicPostDiscussion"

// the patch that starts the film after the image, which recordings already running before it skip on replay. the patch id
// must not change, because workflow histories record it
const TOPIC_VIDEO_PATCH = "topic-podcast-episode-video"

// the patch that moves a scheduled Scan's chapters to their own queue. a recording that scheduled its chapters before
// it replays them on the recording queue. the patch id must not change, because workflow histories record it
const SCHEDULED_CHAPTER_QUEUE_PATCH = "scheduled-chapter-queue"

// the patch that moves the encode to its own queue. a recording that scheduled its encode before it replays the
// encode on the recording queue. the patch id must not change, because workflow histories record it
const ENCODE_QUEUE_PATCH = "podcast-episode-encode-queue"

// the writes and the films setting's read are idempotent, so they may retry
const {
	planPodcastEpisode,
	savePodcastEpisodeScript,
	publishPodcastEpisode,
	failPodcastEpisode,
	isTopicPodcastEpisodeVideoEnabled,
	selectNewTopicVideoRenderVersion,
} = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: PODCAST_WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: PODCAST_WRITE_ATTEMPTS },
})

// a script activity fails for good on a spent budget or on a script rejected on every draft. any other failure
// retries with the chapter's backoff until an hour after the activity was scheduled, so a model's rate limit delays
// the podcast episode
const { outlinePodcastEpisode, writePodcastEpisodeSegment } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: PODCAST_SCRIPT_TIMEOUT_MS,
	scheduleToCloseTimeout: PODCAST_SCRIPT_TOTAL_TIMEOUT_MS,
	retry: PODCAST_CHAPTER_RETRY_POLICY,
})

// a chapter's activity fails for good on a rejection and retries a failure that another attempt can fix, until an
// hour after the chapter was scheduled
const { recordPodcastEpisodeChapter: recordStandardChapter } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: STANDARD_CHAPTER_TIMEOUT_MS,
	scheduleToCloseTimeout: STANDARD_CHAPTER_TOTAL_TIMEOUT_MS,
	retry: PODCAST_CHAPTER_RETRY_POLICY,
})

// a flex chapter has no attempt limit. the six-hour limit across its attempts ends its wait
const { recordPodcastEpisodeChapter: recordFlexChapter } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: FLEX_CHAPTER_TIMEOUT_MS,
	scheduleToCloseTimeout: FLEX_CHAPTER_TOTAL_TIMEOUT_MS,
	retry: PODCAST_CHAPTER_RETRY_POLICY,
})

// a scheduled Scan's flex chapter on the scheduled chapter queue, with the same timeouts and retries
const { recordPodcastEpisodeChapter: recordScheduledQueueChapter } = proxyActivities<typeof podcastEpisodeActivities>({
	taskQueue: PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
	startToCloseTimeout: FLEX_CHAPTER_TIMEOUT_MS,
	scheduleToCloseTimeout: FLEX_CHAPTER_TOTAL_TIMEOUT_MS,
	retry: PODCAST_CHAPTER_RETRY_POLICY,
})

// the podcast episode image draws after the publish, and a failure leaves the podcast episode without one
const { drawPodcastEpisodeImageActivity } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: PODCAST_IMAGE_TIMEOUT_MS,
	retry: PODCAST_IMAGE_RETRY_POLICY,
})

// the encode starts over from the chapters in object storage, so the encode may retry. it heartbeats, so an encode
// whose worker was killed is tried again after two minutes instead of ten
const ENCODE_ACTIVITY_OPTIONS = {
	startToCloseTimeout: PODCAST_ENCODE_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { maximumAttempts: PODCAST_ENCODE_ATTEMPTS },
}

// the encode on its own queue, where it waits for a core with no limit on the wait, and the encode on the recording
// queue for a recording from before the encode queue
const { encodePodcastEpisode: encodeOnEncodeQueue } = proxyActivities<typeof podcastEpisodeActivities>({
	...ENCODE_ACTIVITY_OPTIONS,
	taskQueue: PODCAST_EPISODE_ENCODE_TASK_QUEUE,
})
const { encodePodcastEpisode: encodeOnRecordingQueue } =
	proxyActivities<typeof podcastEpisodeActivities>(ENCODE_ACTIVITY_OPTIONS)

/**
 * Records one Scan's Podcast Episode and signals the Scan's email workflow once the outline is settled.
 */
export async function recordPodcastEpisodeWorkflow({
	scanId,
	topicId,
	billedUserId,
	trigger,
}: RecordPodcastEpisodeWorkflowInput): Promise<void> {
	// plan the Podcast Episode. if the plan fails or finds nothing to record, end the email's wait and stop
	const podcastEpisodePlan = await planPodcastEpisode({ scanId, topicId, billedUserId }).catch(
		async (error: unknown) => {
			await signalOutlineSettled(scanId)
			throw error
		},
	)
	if (!podcastEpisodePlan) {
		await signalOutlineSettled(scanId)
		return
	}

	// the Podcast Episode's row and the Findings that it narrates
	const { podcastEpisodeId, plannedFindings } = podcastEpisodePlan
	const scriptCallOptions = { podcastEpisodeId, topicId, billedUserId, plannedFindings }

	// fail the Podcast Episode if any activity but a chapter's speech fails for good
	try {
		// write the outline and save its title, then end the email's wait whether the outline saved or failed
		const podcastEpisodeOutline = await outlinePodcastEpisode(scriptCallOptions).finally(() =>
			signalOutlineSettled(scanId),
		)

		// write each segment against the outline, then save the whole script
		const podcastEpisodeSegments = await Promise.all(
			podcastEpisodeOutline.segments.map((_, segmentIndex) =>
				writePodcastEpisodeSegment({ ...scriptCallOptions, outline: podcastEpisodeOutline, segmentIndex }),
			),
		)
		const chapterCount = await savePodcastEpisodeScript(podcastEpisodeId, podcastEpisodeSegments)

		// a scheduled Scan's chapters are recorded on the flex tier, on their own queue unless the recording is from before
		// that queue, and any other Scan's on the standard tier
		const isScheduledScan = trigger === "scheduled"
		const speechTier: SpeechTier = isScheduledScan ? "flex" : "standard"
		const recordScheduledChapter =
			isScheduledScan && patched(SCHEDULED_CHAPTER_QUEUE_PATCH) ? recordScheduledQueueChapter : recordFlexChapter
		const recordChapter = isScheduledScan ? recordScheduledChapter : recordStandardChapter
		const chapterPositions = Array.from({ length: chapterCount }, (_, position) => position)

		// record every chapter in parallel. a chapter whose speech fails for good is left out,
		// and the Podcast Episode fails only if no chapter is recorded
		let firstChapterError: unknown = null
		const recordChapterResults = await Promise.all(
			chapterPositions.map((position) =>
				recordChapter({ podcastEpisodeId, billedUserId, position, speechTier }).catch((error: unknown) => {
					firstChapterError ??= error
					return null
				}),
			),
		)
		const recordedChapters = recordChapterResults.filter((recordChapterResult) => recordChapterResult !== null)
		if (recordedChapters.length === 0) {
			throw firstChapterError
		}

		// join the chapters' audio from object storage, on the encode queue unless the recording is from before that
		// queue, then publish the Podcast Episode
		const encodePodcastEpisode = patched(ENCODE_QUEUE_PATCH) ? encodeOnEncodeQueue : encodeOnRecordingQueue
		const encodedPodcastEpisode = await encodePodcastEpisode(podcastEpisodeId, recordedChapters)
		const chapterAttemptCounts = recordedChapters.map((recordedChapter) => recordedChapter.attemptCount)
		const recordedChapterPositions = recordedChapters.map((recordedChapter) => recordedChapter.position)
		await publishPodcastEpisode({
			podcastEpisodeId,
			plannedFindings,
			encodedPodcastEpisode,
			speechTier,
			chapterAttemptCounts,
			recordedChapterPositions,
		})
	} catch (error) {
		await failPodcastEpisode({ podcastEpisodeId, reason: toWorkflowFailureReason(error) })
		return
	}

	// the published episode's own image. the episode shows its topic's image until one is drawn
	await drawPodcastEpisodeImageActivity(podcastEpisodeId).catch(() => undefined)

	// the film renders on its own queue as an abandoned child, so the recording never waits for it or fails with it
	if (patched(TOPIC_VIDEO_PATCH)) {
		await startTopicVideo(podcastEpisodeId)
	}
}

// start the podcast episode's film if films are on. a film already started, or a failed start, leaves no film
async function startTopicVideo(podcastEpisodeId: string): Promise<void> {
	try {
		// a recording from before version 4 reads the films setting, and a newer one records the render version it was
		// admitted at
		const usesVersionedScenes = patched("topic-video-chapter-scenes-v4")
		const renderVersion = usesVersionedScenes
			? await selectNewTopicVideoRenderVersion()
			: (await isTopicPodcastEpisodeVideoEnabled())
				? 3
				: false

		// films that are off or paused start no film
		if (!renderVersion) {
			return
		}

		// the film's own workflow id rejects a second render of the same film
		await startChild(TOPIC_VIDEO_WORKFLOW, {
			workflowId: toTopicVideoWorkflowId(podcastEpisodeId),
			taskQueue: TOPIC_VIDEO_TASK_QUEUE,
			args: [usesVersionedScenes ? { podcastEpisodeId, renderVersion } : { podcastEpisodeId }],
			parentClosePolicy: ParentClosePolicy.ABANDON,
		})
	} catch {
		// the podcast episode is published either way
	}
}

// signal the Scan's email workflow that the outline is settled
async function signalOutlineSettled(scanId: string): Promise<void> {
	try {
		await getExternalWorkflowHandle(`scan-email-${scanId}`).signal(podcastEpisodeOutlineSettledSignal)
	} catch {
		// an email workflow that already finished, or never started, has nothing to wait for
	}
}
