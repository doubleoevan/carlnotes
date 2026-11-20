// the activities that record a Scan's Podcast Episode.
// a script or speech failure that another attempt cannot fix is marked non-retryable

import type { TopicVideoRenderVersion } from "@carlnotes/contracts/topicVideoWork"
import { loadSpendControlSettings } from "@carlnotes/db/dailySpendCutoffs"
import { isBudgetRejection } from "@carlnotes/models/models"
import * as podcastEpisodeAudio from "@carlnotes/pipeline/podcast/podcastEpisodeAudio"
import {
	drawPodcastEpisodeImage,
	PodcastEpisodeImageRejectedError,
} from "@carlnotes/pipeline/podcast/podcastEpisodeImage"
import type { PodcastEpisodeOutline } from "@carlnotes/pipeline/podcast/podcastEpisodeOutline"
import { type PodcastEpisodeSegment, RejectedScriptError } from "@carlnotes/pipeline/podcast/podcastEpisodeScript"
import * as writePodcastEpisodeScript from "@carlnotes/pipeline/podcast/writePodcastEpisodeScript"
import { storePodcastEpisodeCovers } from "@carlnotes/pipeline/podcastCover"
import { reportError } from "@carlnotes/server/monitoring"
import { newTopicVideoRenderVersion, topicVideoConcurrency } from "@carlnotes/server/podcastEpisodeSettings"
import { ApplicationFailure, activityInfo } from "@temporalio/activity"
import { runWithHeartbeat } from "../activityHeartbeat"

// the plan, the publish, and the failure are exported as they are. each throws only on an unexpected error
export { planPodcastEpisode } from "@carlnotes/pipeline/podcast/planPodcastEpisode"
export { failPodcastEpisode, publishPodcastEpisode } from "@carlnotes/pipeline/podcast/publishPodcastEpisode"

/**
 * Joins the recorded chapters into the podcast episode's audio and stores it, heartbeating every 30 seconds, and stops
 * the downloads, the join, and the upload once the attempt is cancelled.
 */
export function encodePodcastEpisode(
	podcastEpisodeId: string,
	recordedChapters: podcastEpisodeAudio.RecordedChapter[],
): ReturnType<typeof podcastEpisodeAudio.encodePodcastEpisode> {
	return runWithHeartbeat((signal) =>
		podcastEpisodeAudio.encodePodcastEpisode(podcastEpisodeId, recordedChapters, signal),
	)
}

// the Topic Post Discussion's activities run on the same queue
export * from "./recordTopicPostDiscussionActivities"

// a recorded chapter with how many attempts its recording took
export type RecordedChapterAttempt = podcastEpisodeAudio.RecordedChapter & { attemptCount: number }

/**
 * Writes the outline and saves its title and description. Fails for good on a rejected script or a spent budget.
 */
export async function outlinePodcastEpisode(
	scriptCallOptions: writePodcastEpisodeScript.PodcastEpisodeScriptCallOptions,
): Promise<PodcastEpisodeOutline> {
	return withNonRetryableScriptFailures(() => writePodcastEpisodeScript.outlinePodcastEpisode(scriptCallOptions))
}

/**
 * Writes one segment's turns. Fails for good if every draft was rejected or the budget is spent.
 */
export async function writePodcastEpisodeSegment(
	writePodcastEpisodeSegmentOptions: writePodcastEpisodeScript.WritePodcastEpisodeSegmentOptions,
): Promise<PodcastEpisodeSegment> {
	return withNonRetryableScriptFailures(() =>
		writePodcastEpisodeScript.writePodcastEpisodeSegment(writePodcastEpisodeSegmentOptions),
	)
}

/**
 * Builds and saves the whole script, returns its chapter count, and fails for good if the script fails its checks.
 */
export async function savePodcastEpisodeScript(
	podcastEpisodeId: string,
	segments: PodcastEpisodeSegment[],
): Promise<number> {
	return withNonRetryableScriptFailures(() =>
		writePodcastEpisodeScript.savePodcastEpisodeScript(podcastEpisodeId, segments),
	)
}

/**
 * Records one chapter to object storage, throwing a failure that says whether another attempt can help.
 */
export async function recordPodcastEpisodeChapter(
	recordPodcastEpisodeChapterOptions: podcastEpisodeAudio.RecordPodcastEpisodeChapterOptions,
): Promise<RecordedChapterAttempt> {
	try {
		// record the chapter, and note which attempt recorded it
		const recordedChapter = await podcastEpisodeAudio.recordPodcastEpisodeChapter(recordPodcastEpisodeChapterOptions)
		return { ...recordedChapter, attemptCount: activityInfo().attempt }
	} catch (error) {
		// retry a speech failure that another attempt can fix, and end the chapter's attempts on any other speech failure
		if (error instanceof podcastEpisodeAudio.SpeechFailedError) {
			throw ApplicationFailure.create({
				message: error.message,
				type: "SpeechFailed",
				nonRetryable: !error.isRetryable,
			})
		}
		throw error
	}
}

// run a script call, and mark a rejected script or a spent budget non-retryable
async function withNonRetryableScriptFailures<Result>(runScriptCall: () => Promise<Result>): Promise<Result> {
	try {
		return await runScriptCall()
	} catch (error) {
		// a rejected script already used every draft, so mark the rejection non-retryable
		if (error instanceof RejectedScriptError) {
			throw ApplicationFailure.create({ message: error.message, type: "RejectedScript", nonRetryable: true })
		}

		// a spent budget fails for good too. no retry this month can fix a spent budget
		if (isBudgetRejection(error)) {
			const message = error instanceof Error ? error.message : String(error)
			throw ApplicationFailure.create({ message, type: "BudgetSpent", nonRetryable: true })
		}
		throw error
	}
}

/**
 * Draws a published podcast episode's own image, then draws its cover once and stores the cover at both sizes, so
 * no request for the cover draws it. Fails for good on a spent budget or a rejected render.
 */
export async function drawPodcastEpisodeImageActivity(podcastEpisodeId: string): Promise<void> {
	try {
		await drawPodcastEpisodeImage({ podcastEpisodeId })
	} catch (error) {
		// a spent budget and a rejection are final, so the cover is stored over the image the podcast episode is left
		// with. anything else is worth another attempt, which stores the cover
		if (error instanceof PodcastEpisodeImageRejectedError || isBudgetRejection(error)) {
			await storePodcastEpisodeCoversOrReport(podcastEpisodeId)
			throw ApplicationFailure.nonRetryable(error instanceof Error ? error.message : String(error), "ImageRejected")
		}
		throw error
	}
	await storePodcastEpisodeCoversOrReport(podcastEpisodeId)
}

// store the podcast episode's cover at both sizes. a failed draw or store is reported and never fails the image step
async function storePodcastEpisodeCoversOrReport(podcastEpisodeId: string): Promise<void> {
	try {
		await storePodcastEpisodeCovers(podcastEpisodeId)
	} catch (error) {
		console.error(`could not store the cover of podcast episode ${podcastEpisodeId}`, error)
		reportError(error, "podcast-episode", { podcastEpisodeId, step: "cover" })
	}
}

/**
 * Returns whether a new podcast episode starts its film: films are on, which a TOPIC_VIDEO_CONCURRENCY of zero turns
 * off, and new films are not paused in the spend control settings. Its name must not change, because a recording under
 * way calls the activity by name.
 */
export async function isTopicPodcastEpisodeVideoEnabled(): Promise<boolean> {
	// skip the settings read if films are off
	if (topicVideoConcurrency() === 0) {
		return false
	}
	return !(await loadSpendControlSettings()).isTopicVideoRenderingPaused
}

/** Records the admitted render version in workflow history, so a retry survives a rollout or rollback. */
export async function selectNewTopicVideoRenderVersion(): Promise<TopicVideoRenderVersion | false> {
	return (await isTopicPodcastEpisodeVideoEnabled()) ? newTopicVideoRenderVersion() : false
}
