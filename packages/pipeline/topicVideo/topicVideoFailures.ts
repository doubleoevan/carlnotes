// a podcast episode film's failure: the failed render version a ready film keeps, the failed row a last attempt
// records with its report and analytics event, and the delete of the shots a render kept

import type { TopicVideoRenderVersion } from "@carlnotes/contracts/topicVideoWork"
import { db } from "@carlnotes/db"
import { topicVideos } from "@carlnotes/db/schema/podcast"
import { clearStatusReads } from "@carlnotes/db/statusReadCaches"
import { deleteStoredObjects, listStoredObjectKeys } from "@carlnotes/db/store"
import { toTopicVideoShotKeyPrefix } from "@carlnotes/db/topicVideoKeys"
import { clearVisitorPagesOfTopic } from "@carlnotes/db/visitorPageCaches"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, ne } from "drizzle-orm"
import { loadTopicVideoPodcastEpisode } from "./topicVideoInputs"
import { TOPIC_VIDEO_RENDER_VERSION } from "./topicVideoRows"

/**
 * Records that a ready film's render at the current render version failed for good, and leaves the film that plays as
 * it is. Returns whether the podcast episode had a ready film.
 */
export async function saveTopicVideoRerenderFailed(
	podcastEpisodeId: string,
	renderVersion: number = TOPIC_VIDEO_RENDER_VERSION,
): Promise<boolean> {
	// the ready film's row, with the failed render version saved on it
	const isReadyFilm = and(eq(topicVideos.podcastEpisodeId, podcastEpisodeId), eq(topicVideos.status, "ready"))
	const failedRows = await db
		.update(topicVideos)
		.set({ failedRenderVersion: renderVersion })
		.where(isReadyFilm)
		.returning({ id: topicVideos.id })
	return failedRows.length > 0
}

// the podcast episode whose film failed, the failure's reason, the render version of a selected render, and whether a
// cancellation ended the render
export type MarkTopicVideoFailedOptions = {
	podcastEpisodeId: string
	reason: string
	renderVersion?: TopicVideoRenderVersion
	isCancelled?: boolean
}

/**
 * Marks a film failed after its last attempt, reports the error, and records the failure for analytics. A ready film
 * whose render at the current render version failed stays ready, with that version recorded as failed. A cancelled
 * render fails a first render alone: a ready film keeps its row as it is, with no failed version, so the next backfill
 * lists it again.
 */
export async function markTopicVideoFailed({
	podcastEpisodeId,
	reason,
	renderVersion,
	isCancelled = false,
}: MarkTopicVideoFailedOptions): Promise<void> {
	// read the podcast episode's topic and owner for the report. a ready film keeps playing
	const topicVideoPodcastEpisode = await loadTopicVideoPodcastEpisode(podcastEpisodeId)
	const isReadyFilmKept = !isCancelled && (await saveTopicVideoRerenderFailed(podcastEpisodeId, renderVersion))

	// any other row is marked failed, unless another render saved it ready meanwhile
	const isUnfinished = and(eq(topicVideos.podcastEpisodeId, podcastEpisodeId), ne(topicVideos.status, "ready"))
	const failedRows = isReadyFilmKept
		? []
		: await db
				.update(topicVideos)
				.set({ status: "failed", error: reason.slice(0, 500) })
				.where(isUnfinished)
				.returning({ id: topicVideos.id })

	// the film's status copy and its topic's visitor pages go, so a poll and the next page read show it failed
	await clearStatusReads("topicVideo", podcastEpisodeId)
	if (topicVideoPodcastEpisode) {
		await clearVisitorPagesOfTopic(topicVideoPodcastEpisode.topicId).catch((error: unknown) => {
			reportError(error, "topic-video", { podcastEpisodeId, step: "clear-visitor-pages" })
		})
	}

	// a cancelled render with no first render in progress changed nothing, so it reports nothing
	if (isCancelled && failedRows.length === 0) {
		return
	}

	// no attempt is left to reuse the shots that a failed render kept. a cancelled first render's shots stay for the
	// render that the backfill lists once more
	if (!isCancelled) {
		await deleteStoredVideoShots(podcastEpisodeId)
	}
	reportError(new Error("a podcast episode film failed to render"), "topic-video", {
		podcastEpisodeId,
		error: reason.slice(0, 200),
	})

	// the failure event holds ids and a short reason code only
	if (topicVideoPodcastEpisode) {
		trackEvent("episode_video_render_failed", topicVideoPodcastEpisode.ownerId, {
			topicId: topicVideoPodcastEpisode.topicId,
			podcastEpisodeId,
			reason: toRenderFailureReason(reason),
		})
	}
}

/**
 * Deletes every shot that a podcast episode's renders kept, at every render version. Each deleted shot's pending
 * deletion is cleared, and a failed delete keeps it for the sweep. A failed listing is reported.
 */
export async function deleteStoredVideoShots(podcastEpisodeId: string): Promise<void> {
	try {
		// list the shots under the podcast episode's prefix and delete them
		const shotKeys = await listStoredObjectKeys(toTopicVideoShotKeyPrefix(podcastEpisodeId))
		await deleteStoredObjects(shotKeys)
	} catch (error) {
		reportError(error, "topic-video", { podcastEpisodeId, step: "stored-shots-delete" })
	}
}

// a short reason code from a failure's reason, which the analytics event includes instead of the reason
function toRenderFailureReason(reason: string): string {
	// a failed encode or probe names its tool
	if (reason.startsWith("ffmpeg")) {
		return "ffmpeg"
	}
	if (reason.startsWith("ffprobe")) {
		return "ffprobe"
	}

	// any other failure is a timeout or something else
	return /timed? ?out/i.test(reason) ? "timeout" : "other"
}
