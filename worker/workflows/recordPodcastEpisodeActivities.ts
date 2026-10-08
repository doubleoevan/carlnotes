// the activities that record a Scan's Podcast Episode.
// a script or speech failure that another attempt cannot fix is marked non-retryable
import { ApplicationFailure, activityInfo } from "@temporalio/activity"
import { isBudgetRejection } from "../models"
import * as podcastEpisodeAudio from "../podcast/podcastEpisodeAudio"
import type { PodcastEpisodeOutline } from "../podcast/podcastEpisodeOutline"
import { type PodcastEpisodeSegment, RejectedScriptError } from "../podcast/podcastEpisodeScript"
import * as writePodcastEpisodeScript from "../podcast/writePodcastEpisodeScript"

// the plan, the encode, the publish, and the failure are exported as they are. each throws only on an unexpected error
export { planPodcastEpisode } from "../podcast/planPodcastEpisode"
export { encodePodcastEpisode } from "../podcast/podcastEpisodeAudio"
export { failPodcastEpisode, publishPodcastEpisode } from "../podcast/publishPodcastEpisode"

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
