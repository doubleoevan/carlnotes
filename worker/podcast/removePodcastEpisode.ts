// removing a Podcast Episode, marking Podcast Episodes removed, and deleting the stored audio of one Podcast Episode
// or of every Podcast Episode of a Topic
import { eq, inArray } from "drizzle-orm"
import { type DbTransaction, db } from "../../db"
import { podcastEpisodeChapters, podcastEpisodeListens, podcastEpisodes } from "../../db/schema"
import { deleteAttachment, toPodcastEpisodeAudioKey, toPodcastEpisodeChapterKey } from "../store"
import { toChapterTurns } from "./podcastEpisodeScript"

// how many Podcast Episodes' audio a Topic's deletion deletes at once
const PODCAST_EPISODE_DELETE_BATCH_SIZE = 10

/**
 * Removes a published or failed Podcast Episode and keeps its row as removed with its season, episode number, and cost.
 * Returns whether there was a Podcast Episode to remove.
 */
export async function removePodcastEpisode(podcastEpisodeId: string): Promise<boolean> {
	// remove only a published or failed Podcast Episode. a recording Podcast Episode belongs to its workflow
	const [podcastEpisode] = await db
		.select({ id: podcastEpisodes.id, status: podcastEpisodes.status, script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (podcastEpisode?.status !== "published" && podcastEpisode?.status !== "failed") {
		return false
	}

	// delete the audio, the chapters, and the listens, and keep the row as removed
	await deletePodcastEpisodeAudio(podcastEpisode)
	await db.transaction(async (transaction) => {
		// delete the chapters, so a later Podcast Episode may narrate the Findings again
		await transaction
			.delete(podcastEpisodeChapters)
			.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))
		await markPodcastEpisodesRemoved(transaction, [podcastEpisodeId])
	})
	return true
}

/**
 * Deletes the Podcast Episodes' listen state and marks their rows removed, with no script and no audio fields.
 * Their chapters stay, so the Findings that they narrated still count as narrated.
 */
export async function markPodcastEpisodesRemoved(
	transaction: DbTransaction,
	podcastEpisodeIds: string[],
): Promise<void> {
	// delete the listens
	await transaction
		.delete(podcastEpisodeListens)
		.where(inArray(podcastEpisodeListens.podcastEpisodeId, podcastEpisodeIds))

	// mark each row removed, and clear its script and its audio fields
	await transaction
		.update(podcastEpisodes)
		.set({ status: "removed", script: null, audioKey: null, audioByteSize: null, durationSeconds: null })
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))
}

/**
 * Deletes the stored audio of every Podcast Episode of a Topic, with any chapter audio that a recording left behind.
 */
export async function deleteTopicPodcastEpisodeAudio(topicId: string): Promise<void> {
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id, script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.topicId, topicId))

	// delete a few Podcast Episodes' audio at a time.
	// a Topic with hundreds of Podcast Episodes has thousands of audio objects
	for (let i = 0; i < podcastEpisodeRows.length; i += PODCAST_EPISODE_DELETE_BATCH_SIZE) {
		const podcastEpisodeRowBatch = podcastEpisodeRows.slice(i, i + PODCAST_EPISODE_DELETE_BATCH_SIZE)
		await Promise.all(podcastEpisodeRowBatch.map((podcastEpisodeRow) => deletePodcastEpisodeAudio(podcastEpisodeRow)))
	}
}

/**
 * Deletes one Podcast Episode's finished audio and the chapter audio of its recording.
 * An object that is not there is skipped.
 */
export async function deletePodcastEpisodeAudio({
	id,
	script,
}: Pick<typeof podcastEpisodes.$inferSelect, "id" | "script">): Promise<void> {
	// delete the finished audio, and one chapter object for each chapter of the script
	const chapterCount = script ? toChapterTurns(script).length : 0
	const chapterKeys = Array.from({ length: chapterCount }, (_, position) => toPodcastEpisodeChapterKey(id, position))
	await Promise.all([toPodcastEpisodeAudioKey(id), ...chapterKeys].map((objectKey) => deleteAttachment(objectKey)))
}
