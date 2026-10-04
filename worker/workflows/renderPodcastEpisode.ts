// the durable podcast episode render. plan, outline, one script call per segment, one speech call per chapter, encode,
// and publish. a succeeded Scan starts the render as a child workflow that outlives the scan workflow
import { getExternalWorkflowHandle, proxyActivities } from "@temporalio/workflow"
// a relative import. temporal bundles workflow code with webpack, which has no @shared alias
import { toScanFailureReason } from "../../shared/scanFailure"
import type { SpeechTier } from "../budget"
import type * as podcastEpisodeActivities from "./renderPodcastEpisodeActivities"
import type { ScanTrigger } from "./runTopicScanActivities"
import { podcastEpisodeOutlineSettledSignal } from "./sendScanEmail"

// the task queue that this workflow and its activities run on, kept apart from the scan activities' slots
export const PODCAST_EPISODE_TASK_QUEUE = "episode-renders"

// the plan, the saved script, the publish, and the failure are short writes
const WRITE_TIMEOUT_MS = 2 * 60 * 1000
const WRITE_ATTEMPTS = 3

// one attempt of a script activity has time to write up to three drafts, and the activity gets three attempts
const SCRIPT_TIMEOUT_MS = 10 * 60 * 1000
const SCRIPT_ATTEMPTS = 3

// a chapter's retries back off from 30 seconds, doubling up to 15 minutes apart
const CHAPTER_RETRY_POLICY = { initialInterval: 30 * 1000, backoffCoefficient: 2, maximumInterval: 15 * 60 * 1000 }

// a standard chapter gets five attempts, each with a minute more than the speech call's three-minute timeout
const STANDARD_CHAPTER_TIMEOUT_MS = 4 * 60 * 1000
const STANDARD_CHAPTER_ATTEMPTS = 5

// a flex chapter's attempt gets a minute more than the speech call's twelve-minute timeout.
// a flex chapter waits for capacity for up to six hours
const FLEX_CHAPTER_TIMEOUT_MS = 13 * 60 * 1000
const FLEX_CHAPTER_TOTAL_TIMEOUT_MS = 6 * 60 * 60 * 1000

// the encode reads and writes a whole Podcast Episode's audio, and gets three attempts
const ENCODE_TIMEOUT_MS = 10 * 60 * 1000
const ENCODE_ATTEMPTS = 3

// the writes are idempotent, so they may retry
const { planPodcastEpisode, savePodcastEpisodeScript, publishPodcastEpisode, failPodcastEpisode } = proxyActivities<
	typeof podcastEpisodeActivities
>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// a script activity fails for good on a spent budget or on a script rejected on every draft. any other failure retries
const { outlinePodcastEpisode, writePodcastEpisodeSegment } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: SCRIPT_TIMEOUT_MS,
	retry: { maximumAttempts: SCRIPT_ATTEMPTS },
})

// a chapter's activity fails for good on a rejection and retries a failure that another attempt can fix
const { renderPodcastEpisodeChapter: renderStandardChapter } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: STANDARD_CHAPTER_TIMEOUT_MS,
	retry: { ...CHAPTER_RETRY_POLICY, maximumAttempts: STANDARD_CHAPTER_ATTEMPTS },
})

// a flex chapter has no attempt limit. the six-hour limit across its attempts ends its wait
const { renderPodcastEpisodeChapter: renderFlexChapter } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: FLEX_CHAPTER_TIMEOUT_MS,
	scheduleToCloseTimeout: FLEX_CHAPTER_TOTAL_TIMEOUT_MS,
	retry: CHAPTER_RETRY_POLICY,
})

// the encode starts over from the chapters in object storage, so the encode may retry
const { encodePodcastEpisode } = proxyActivities<typeof podcastEpisodeActivities>({
	startToCloseTimeout: ENCODE_TIMEOUT_MS,
	retry: { maximumAttempts: ENCODE_ATTEMPTS },
})

// the Scan whose Podcast Episode this is, its Topic, the user that the Scan billed, and what asked for the Scan
export type RenderPodcastEpisodeWorkflowInput = {
	scanId: string
	topicId: string
	billedUserId: string
	trigger: ScanTrigger
}

/**
 * Renders one Scan's Podcast Episode and signals the Scan's email workflow once the outline is settled.
 */
export async function renderPodcastEpisodeWorkflow({
	scanId,
	topicId,
	billedUserId,
	trigger,
}: RenderPodcastEpisodeWorkflowInput): Promise<void> {
	// plan the Podcast Episode. if the plan fails or finds nothing to render, end the email's wait and stop
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

		// a scheduled Scan's chapters render on the flex tier, and any other Scan's on the standard tier
		const isScheduledScan = trigger === "scheduled"
		const speechTier: SpeechTier = isScheduledScan ? "flex" : "standard"
		const renderChapter = isScheduledScan ? renderFlexChapter : renderStandardChapter
		const chapterPositions = Array.from({ length: chapterCount }, (_, position) => position)

		// render every chapter in parallel. a chapter whose speech fails for good is left out,
		// and the Podcast Episode fails only if no chapter renders
		let firstChapterError: unknown = null
		const renderChapterResults = await Promise.all(
			chapterPositions.map((position) =>
				renderChapter({ podcastEpisodeId, billedUserId, position, speechTier }).catch((error: unknown) => {
					firstChapterError ??= error
					return null
				}),
			),
		)
		const renderedChapters = renderChapterResults.filter((renderChapterResult) => renderChapterResult !== null)
		if (renderedChapters.length === 0) {
			throw firstChapterError
		}

		// join the chapters' audio from object storage, then publish the Podcast Episode
		const encodedPodcastEpisode = await encodePodcastEpisode(podcastEpisodeId, renderedChapters)
		const chapterAttemptCounts = renderedChapters.map((renderedChapter) => renderedChapter.attemptCount)
		const renderedChapterPositions = renderedChapters.map((renderedChapter) => renderedChapter.position)
		await publishPodcastEpisode({
			podcastEpisodeId,
			plannedFindings,
			encodedPodcastEpisode,
			speechTier,
			chapterAttemptCounts,
			renderedChapterPositions,
		})
	} catch (error) {
		await failPodcastEpisode({ podcastEpisodeId, reason: toScanFailureReason(error) })
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
