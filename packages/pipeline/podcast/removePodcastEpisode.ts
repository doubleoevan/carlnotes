// removing a Podcast Episode, marking Podcast Episodes removed with their films, and the keys of the stored audio and
// films of one Podcast Episode or of every Podcast Episode of a Topic

import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import { type DbHandle, type DbTransaction, db } from "@carlnotes/db"
import {
	releasePodcastEpisodeHomeOrder,
	releaseTopicPodcastEpisodeVideoHomeOrders,
} from "@carlnotes/db/podcastEpisodeHomeOrder"
import {
	releasePodcastEpisodeProfileOrder,
	releaseTopicPodcastEpisodeVideoProfileOrders,
} from "@carlnotes/db/profileOrder"
import {
	podcastEpisodeChapters,
	podcastEpisodeListens,
	podcastEpisodes,
	topicPodcastEpisodeVideos,
} from "@carlnotes/db/schema/podcast"
import { comments, reactions } from "@carlnotes/db/schema/social"
import {
	deleteStoredObjects,
	recordPendingObjectDeletions,
	toPodcastEpisodeAudioKey,
	toPodcastEpisodeChapterKey,
} from "@carlnotes/db/store"
import { toTopicPodcastEpisodeVideoKeys } from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import { clearUnseenCommentMentions, loadPodcastEpisodeMentionedUserIds } from "@carlnotes/db/unseenCommentMentions"
import { eq, inArray } from "drizzle-orm"
import { rebuildTopicDashboardsById } from "../dashboardRebuild"
import { deletePodcastEpisodeVectors } from "../meanVectors"
import { toPodcastEpisodeImageObjectKeys } from "../topicImages/topicImageFiles"
import { toChapterTurns } from "./podcastEpisodeScript"

/**
 * Removes a published or failed Podcast Episode and keeps its row as removed with its season, episode number, and cost.
 * Returns whether there was a Podcast Episode to remove.
 */
export async function removePodcastEpisode(podcastEpisodeId: string): Promise<boolean> {
	// remove only a published or failed Podcast Episode. a recording Podcast Episode belongs to its workflow
	const [podcastEpisode] = await db
		.select({
			id: podcastEpisodes.id,
			status: podcastEpisodes.status,
			script: podcastEpisodes.script,
			imageHash: podcastEpisodes.imageHash,
			topicId: podcastEpisodes.topicId,
		})
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (podcastEpisode?.status !== "published" && podcastEpisode?.status !== "failed") {
		return false
	}

	// read the audio keys while the script still names the chapters, and the image's keys
	const audioAndImageKeys = [
		...toPodcastEpisodeAudioKeys(podcastEpisode),
		...(podcastEpisode.imageHash ? toPodcastEpisodeImageObjectKeys(podcastEpisode.id, podcastEpisode.imageHash) : []),
	]

	// delete the chapters and the listens, keep the row as removed, and record every key with its film's, in one
	// transaction
	const { objectKeys, mentionedUserIds } = await db.transaction(async (transaction) => {
		// a pinned podcast episode leaves the home and its topic owner's profile pins
		await releasePodcastEpisodeHomeOrder(podcastEpisodeId, transaction)
		await releasePodcastEpisodeProfileOrder(podcastEpisodeId, transaction)
		// delete the chapters, so a later Podcast Episode may narrate the Findings again
		await transaction
			.delete(podcastEpisodeChapters)
			.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))
		const removedPodcastEpisodes = await markPodcastEpisodesRemoved(transaction, [podcastEpisodeId])
		const removedObjectKeys = [...audioAndImageKeys, ...removedPodcastEpisodes.filmKeys]
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: removedObjectKeys })
		return { objectKeys: removedObjectKeys, mentionedUserIds: removedPodcastEpisodes.mentionedUserIds }
	})

	// delete the audio once the row is marked, and clear the cached unseen Comment Mentions that its Comments held
	await deleteStoredObjects(objectKeys)
	await clearUnseenCommentMentions(mentionedUserIds)

	// the removed podcast episode leaves its topic's Dashboards at once
	if (podcastEpisode.topicId) {
		await rebuildTopicDashboardsById(podcastEpisode.topicId)
	}
	return true
}

// what marking Podcast Episodes removed leaves for its caller: the films' stored keys, to record as pending deletions
// in the same transaction, and the users whose cached unseen Comment Mentions to clear after the commit
export type RemovedPodcastEpisodes = { filmKeys: string[]; mentionedUserIds: string[] }

/**
 * Deletes the Podcast Episodes' listen state, vectors, reactions, comments, and films and marks their rows removed, with
 * no script and no audio fields. Their chapters stay, so the Findings that they narrated still count as narrated.
 * Returns the films' stored keys and the users that the deleted comments mentioned.
 */
export async function markPodcastEpisodesRemoved(
	transaction: DbTransaction,
	podcastEpisodeIds: string[],
): Promise<RemovedPodcastEpisodes> {
	// count each film's chapters while its podcast episode still holds the script
	const chapterCounts = await loadTopicPodcastEpisodeVideoChapterCounts(transaction, podcastEpisodeIds)

	// delete the listens and the vectors
	await transaction
		.delete(podcastEpisodeListens)
		.where(inArray(podcastEpisodeListens.podcastEpisodeId, podcastEpisodeIds))
	await deletePodcastEpisodeVectors(podcastEpisodeIds, transaction)

	// delete the reactions and the comments, which the kept row would otherwise keep, after reading who the comments
	// mention
	const mentionedUserIds = await loadPodcastEpisodeMentionedUserIds(podcastEpisodeIds, transaction)
	await transaction.delete(reactions).where(inArray(reactions.podcastEpisodeId, podcastEpisodeIds))
	await transaction.delete(comments).where(inArray(comments.podcastEpisodeId, podcastEpisodeIds))

	// mark each row removed, and clear its script, its audio fields, and its image
	await transaction
		.update(podcastEpisodes)
		.set({
			status: "removed",
			script: null,
			audioKey: null,
			audioByteSize: null,
			durationSeconds: null,
			imageHash: null,
		})
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))

	// a pinned film leaves the home and its topic owner's profile pins. then delete the films, which the kept row would
	// otherwise keep, and return their keys with the mentioned users
	await releaseTopicPodcastEpisodeVideoHomeOrders(podcastEpisodeIds, transaction)
	await releaseTopicPodcastEpisodeVideoProfileOrders(podcastEpisodeIds, transaction)
	const filmRows = await transaction
		.delete(topicPodcastEpisodeVideos)
		.where(inArray(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeIds))
		.returning(TOPIC_PODCAST_EPISODE_VIDEO_KEY_COLUMNS)
	const filmKeys = filmRows.flatMap((filmRow) =>
		toTopicPodcastEpisodeVideoKeys({ ...filmRow, chapterCount: chapterCounts.get(filmRow.podcastEpisodeId) ?? 0 }),
	)
	return { filmKeys, mentionedUserIds }
}

// the chapter count of each of the podcast episodes that has a film, by podcast episode
async function loadTopicPodcastEpisodeVideoChapterCounts(
	transaction: DbTransaction,
	podcastEpisodeIds: string[],
): Promise<Map<string, number>> {
	const scriptRows = await transaction
		.select({ id: podcastEpisodes.id, script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.innerJoin(topicPodcastEpisodeVideos, eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodes.id))
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))
	return new Map(scriptRows.map((scriptRow) => [scriptRow.id, toChapterCount(scriptRow.script)]))
}

// the film row's columns that hold stored keys, and the two that name its own image's key
const TOPIC_PODCAST_EPISODE_VIDEO_KEY_COLUMNS = {
	introKey: topicPodcastEpisodeVideos.introKey,
	chaptersKey: topicPodcastEpisodeVideos.chaptersKey,
	signOffKey: topicPodcastEpisodeVideos.signOffKey,
	filmKey: topicPodcastEpisodeVideos.filmKey,
	captionsKey: topicPodcastEpisodeVideos.captionsKey,
	podcastEpisodeId: topicPodcastEpisodeVideos.podcastEpisodeId,
	imageHash: topicPodcastEpisodeVideos.imageHash,
}

/**
 * Returns the keys of the stored audio and films of every Podcast Episode of a Topic, finished audio and chapter audio
 * alike, for a Topic's delete to record while the rows still hold their scripts.
 */
export async function loadTopicPodcastEpisodeObjectKeys(topicId: string, handle: DbHandle = db): Promise<string[]> {
	// read the Topic's Podcast Episodes with their films' keys
	const podcastEpisodeRows = await handle
		.select({ id: podcastEpisodes.id, script: podcastEpisodes.script, ...TOPIC_PODCAST_EPISODE_VIDEO_KEY_COLUMNS })
		.from(podcastEpisodes)
		.leftJoin(topicPodcastEpisodeVideos, eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodes.id))
		.where(eq(podcastEpisodes.topicId, topicId))

	// list each one's audio keys and film keys
	return podcastEpisodeRows.flatMap((podcastEpisodeRow) => [
		...toPodcastEpisodeAudioKeys(podcastEpisodeRow),
		...toTopicPodcastEpisodeVideoKeys({
			...podcastEpisodeRow,
			chapterCount: toChapterCount(podcastEpisodeRow.script),
		}),
	])
}

/**
 * Returns a Podcast Episode's audio keys: its finished audio, and one chapter object for each chapter of its script.
 */
export function toPodcastEpisodeAudioKeys({
	id,
	script,
}: Pick<typeof podcastEpisodes.$inferSelect, "id" | "script">): string[] {
	const chapterKeys = Array.from({ length: toChapterCount(script) }, (_, position) =>
		toPodcastEpisodeChapterKey(id, position),
	)
	return [toPodcastEpisodeAudioKey(id), ...chapterKeys]
}

// how many chapters a script has, or none for a podcast episode with no script
function toChapterCount(script: PodcastEpisodeScript | null): number {
	return script ? toChapterTurns(script).length : 0
}
