// removing a Podcast Episode, marking Podcast Episodes removed, and the keys of the stored audio of one Podcast Episode
// or of every Podcast Episode of a Topic

import { type DbHandle, type DbTransaction, db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodeListens, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import {
	deleteStoredObjects,
	recordPendingObjectDeletions,
	toPodcastEpisodeAudioKey,
	toPodcastEpisodeChapterKey,
} from "@carlnotes/db/store"
import { eq, inArray } from "drizzle-orm"
import { deletePodcastEpisodeVectors } from "../meanVectors"
import { toChapterTurns } from "./podcastEpisodeScript"

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

	// record the audio keys while the script still names the chapters, delete the chapters and the listens, and keep
	// the row as removed, in one transaction
	const objectKeys = toPodcastEpisodeAudioKeys(podcastEpisode)
	await db.transaction(async (transaction) => {
		await recordPendingObjectDeletions({ handle: transaction, objectKeys })
		// delete the chapters, so a later Podcast Episode may narrate the Findings again
		await transaction
			.delete(podcastEpisodeChapters)
			.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))
		await markPodcastEpisodesRemoved(transaction, [podcastEpisodeId])
	})

	// delete the audio once the row is marked
	await deleteStoredObjects(objectKeys)
	return true
}

/**
 * Deletes the Podcast Episodes' listen state and vectors and marks their rows removed, with no script and no audio
 * fields. Their chapters stay, so the Findings that they narrated still count as narrated.
 */
export async function markPodcastEpisodesRemoved(
	transaction: DbTransaction,
	podcastEpisodeIds: string[],
): Promise<void> {
	// delete the listens and the vectors
	await transaction
		.delete(podcastEpisodeListens)
		.where(inArray(podcastEpisodeListens.podcastEpisodeId, podcastEpisodeIds))
	await deletePodcastEpisodeVectors(podcastEpisodeIds, transaction)

	// mark each row removed, and clear its script and its audio fields
	await transaction
		.update(podcastEpisodes)
		.set({ status: "removed", script: null, audioKey: null, audioByteSize: null, durationSeconds: null })
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))
}

/**
 * Returns the keys of the stored audio of every Podcast Episode of a Topic, finished audio and chapter audio alike,
 * for a Topic's delete to record while the rows still hold their scripts.
 */
export async function loadTopicPodcastEpisodeAudioKeys(topicId: string, handle: DbHandle = db): Promise<string[]> {
	// read the Topic's Podcast Episodes and list their audio keys
	const podcastEpisodeRows = await handle
		.select({ id: podcastEpisodes.id, script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.topicId, topicId))
	return podcastEpisodeRows.flatMap((podcastEpisodeRow) => toPodcastEpisodeAudioKeys(podcastEpisodeRow))
}

/**
 * Returns a Podcast Episode's audio keys: its finished audio, and one chapter object for each chapter of its script.
 */
export function toPodcastEpisodeAudioKeys({
	id,
	script,
}: Pick<typeof podcastEpisodes.$inferSelect, "id" | "script">): string[] {
	const chapterCount = script ? toChapterTurns(script).length : 0
	const chapterKeys = Array.from({ length: chapterCount }, (_, position) => toPodcastEpisodeChapterKey(id, position))
	return [toPodcastEpisodeAudioKey(id), ...chapterKeys]
}
