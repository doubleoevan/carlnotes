// how a Podcast Episode's recording ends. published with its season, its episode number, and its chapters,
// replacing the Topic's earlier short Podcast Episodes if it is short, or failed with its reason
import { appBaseUrl } from "@shared/appUrl"
import type { PodcastEpisodeScript } from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { toPodcastEpisodePath } from "@shared/seo"
import { and, eq, inArray, max, ne } from "drizzle-orm"
import { type DbTransaction, db, isUniqueViolation } from "../../db"
import { deletePodcastFeedCache } from "../../db/podcastFeedCache"
import { findings, podcastEpisodeChapters, podcastEpisodes, topics } from "../../db/schema"
import { notifyIndexNow } from "../indexNow"
import { deleteAttachment, toPodcastEpisodeChapterKey } from "../store"
import { tracePodcastEpisodeRecording } from "../telemetry"
import type { PlannedFinding } from "./planPodcastEpisode"
import type { EncodedPodcastEpisode } from "./podcastEpisodeAudio"
import { toChapterTurns, toRecordedPodcastEpisodeScript } from "./podcastEpisodeScript"
import { deletePodcastEpisodeAudio, markPodcastEpisodesRemoved } from "./removePodcastEpisode"

// how many times a publish tries to take the next episode number, if another publish of the Topic takes that episode number first
const PUBLISH_ATTEMPTS = 3

// a publish. the Podcast Episode, its planned Findings, its stored audio, its speech tier,
// each recorded chapter's attempt count, and the script positions of the chapters that were recorded
export type PublishPodcastEpisodeOptions = {
	podcastEpisodeId: string
	plannedFindings: PlannedFinding[]
	encodedPodcastEpisode: EncodedPodcastEpisode
	speechTier: string
	chapterAttemptCounts: number[]
	recordedChapterPositions: number[]
}

// a Podcast Episode whose recording failed for good, and the reason
export type FailPodcastEpisodeOptions = { podcastEpisodeId: string; reason: string }

// what one publish attempt writes. the Topic, the Podcast Episode, the script of its recorded chapters,
// its chapter rows, its stored audio, and the publish time
type SavePodcastEpisodeAsPublishedOptions = {
	topicId: string
	podcastEpisodeId: string
	podcastEpisodeScript: PodcastEpisodeScript
	podcastEpisodeChapterRows: (typeof podcastEpisodeChapters.$inferInsert)[]
	encodedPodcastEpisode: EncodedPodcastEpisode
	publishedAt: Date
	// whether the Podcast Episode is short, which replaces the Topic's earlier short ones
	isShort: boolean
}

// a Podcast Episode that a later short one replaced, with the script that names its chapter audio
type ReplacedPodcastEpisode = Pick<typeof podcastEpisodes.$inferSelect, "id" | "script">

// what a saved publish took. its episode number, and the short Podcast Episodes that it replaced
type SavedPodcastEpisode = { podcastEpisodeNumber: number; replacedPodcastEpisodes: ReplacedPodcastEpisode[] }

// the Topic whose short Podcast Episodes a publish replaces, and the published Podcast Episode that stays
type ReplaceShortPodcastEpisodesOptions = { transaction: DbTransaction; topicId: string; podcastEpisodeId: string }

// a published Podcast Episode's page. its Topic, its season, and its episode number
type NotifyPodcastEpisodePageOptions = { topicId: string; season: number; podcastEpisodeNumber: number }

/**
 * Publishes a recorded Podcast Episode with its season, its episode number, its chapters, and its stored audio's key and size.
 * A short Podcast Episode replaces the Topic's earlier short ones. Then deletes the Topic's cached feeds and tells
 * IndexNow about a public Topic's new podcast episode page.
 */
export async function publishPodcastEpisode({
	podcastEpisodeId,
	plannedFindings,
	encodedPodcastEpisode,
	speechTier,
	chapterAttemptCounts,
	recordedChapterPositions,
}: PublishPodcastEpisodeOptions): Promise<void> {
	// publish only a recording Podcast Episode. a retry after a saved publish writes nothing
	const [podcastEpisode] = await db.select().from(podcastEpisodes).where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (podcastEpisode?.status !== "recording") {
		return
	}

	// throw an error if the Podcast Episode has no Topic or no script
	if (!podcastEpisode.topicId || !podcastEpisode.script) {
		throw new Error(`episode ${podcastEpisodeId} has no topic or no script to publish`)
	}

	// delete the chapters' audio, which the join leaves in place for a retried join to read
	await Promise.all(
		recordedChapterPositions.map((position) =>
			deleteAttachment(toPodcastEpisodeChapterKey(podcastEpisodeId, position)),
		),
	)

	// leave out each chapter whose speech failed for good, with the turns recorded with that chapter,
	// and report how many chapters were left out
	const recordedScript = toRecordedPodcastEpisodeScript(podcastEpisode.script, recordedChapterPositions)
	const leftOutChapterCount = toChapterTurns(podcastEpisode.script).length - recordedChapterPositions.length
	if (leftOutChapterCount > 0) {
		reportError(new Error("an episode left out a chapter whose speech was not recorded"), "podcast-episode", {
			podcastEpisodeId,
			topicId: podcastEpisode.topicId,
			scanId: podcastEpisode.scanId ?? "none",
			leftOutChapterCount: String(leftOutChapterCount),
		})
	}

	// save the Podcast Episode as published. if another publish of the Topic just took the episode number,
	// the unique index rejects the save and the next attempt takes the next episode number
	const podcastEpisodeChapterRows = await toPodcastEpisodeChapterRows({
		podcastEpisodeId,
		podcastEpisodeScript: recordedScript,
		plannedFindings,
		encodedPodcastEpisode,
	})
	const publishedAt = new Date()
	let savedPodcastEpisode: SavedPodcastEpisode | undefined
	for (let attempt = 1; savedPodcastEpisode === undefined; attempt++) {
		try {
			savedPodcastEpisode = await savePodcastEpisodeAsPublished({
				topicId: podcastEpisode.topicId,
				podcastEpisodeId,
				podcastEpisodeScript: recordedScript,
				podcastEpisodeChapterRows,
				encodedPodcastEpisode,
				publishedAt,
				isShort: podcastEpisode.isShort,
			})
		} catch (error) {
			if (!isUniqueViolation(error) || attempt >= PUBLISH_ATTEMPTS) {
				throw error
			}
		}
	}

	// delete the audio of the short Podcast Episodes that this one replaced
	const { podcastEpisodeNumber, replacedPodcastEpisodes } = savedPodcastEpisode
	await deleteReplacedPodcastEpisodeAudio(podcastEpisodeId, replacedPodcastEpisodes)

	// trace the recording with what it took, then delete the Topic's cached feeds,
	// and tell IndexNow about a public Topic's podcast episode page
	const audioMinutes = encodedPodcastEpisode.durationSeconds / 60
	const costDollars = Number(podcastEpisode.cost)
	await tracePodcastEpisodeRecording({
		podcastEpisodeId,
		topicId: podcastEpisode.topicId,
		scanId: podcastEpisode.scanId,
		speechTier,
		chapterAttemptCounts,
		recordingSeconds: Math.round((publishedAt.getTime() - podcastEpisode.createdAt.getTime()) / 1000),
		costDollars,
		costPerAudioMinuteDollars: audioMinutes > 0 ? costDollars / audioMinutes : 0,
	})
	await deletePodcastFeedCache(podcastEpisode.topicId)
	await notifyPodcastEpisodePage({
		topicId: podcastEpisode.topicId,
		season: publishedAt.getUTCFullYear(),
		podcastEpisodeNumber,
	})
}

/**
 * Saves a recording Podcast Episode as failed with its reason, deletes the audio that the recording left,
 * and reports the failure.
 */
export async function failPodcastEpisode({ podcastEpisodeId, reason }: FailPodcastEpisodeOptions): Promise<void> {
	// fail only a recording Podcast Episode
	const [failedPodcastEpisode] = await db
		.update(podcastEpisodes)
		.set({ status: "failed", error: reason })
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), eq(podcastEpisodes.status, "recording")))
		.returning({
			id: podcastEpisodes.id,
			topicId: podcastEpisodes.topicId,
			scanId: podcastEpisodes.scanId,
			script: podcastEpisodes.script,
		})
	if (!failedPodcastEpisode) {
		return
	}

	// delete any audio that the recording left behind
	await deletePodcastEpisodeAudio(failedPodcastEpisode)

	// report the failure with its Topic and its Scan
	console.error(`episode ${podcastEpisodeId} failed to record: ${reason}`)
	reportError(new Error("an episode failed to record"), "podcast-episode", {
		podcastEpisodeId,
		topicId: failedPodcastEpisode.topicId ?? "none",
		scanId: failedPodcastEpisode.scanId ?? "none",
		reason,
	})
}

// the chapter rows of a publish. each script chapter with its Finding's Resource and source url, and its times
async function toPodcastEpisodeChapterRows({
	podcastEpisodeId,
	podcastEpisodeScript,
	plannedFindings,
	encodedPodcastEpisode,
}: Pick<PublishPodcastEpisodeOptions, "podcastEpisodeId" | "plannedFindings" | "encodedPodcastEpisode"> & {
	podcastEpisodeScript: PodcastEpisodeScript
}): Promise<(typeof podcastEpisodeChapters.$inferInsert)[]> {
	// the script's chapters in order
	const scriptChapters = podcastEpisodeScript.segments.flatMap((segment) => segment.chapters)

	// find which planned Findings are still stored.
	// a chapter of a Finding that a later Scan filtered out keeps only its Resource
	const plannedFindingIds = plannedFindings.map((plannedFinding) => plannedFinding.findingId)
	const keptFindingRows = await db
		.select({ id: findings.id })
		.from(findings)
		.where(inArray(findings.id, plannedFindingIds))
	const keptFindingIds = new Set(keptFindingRows.map((keptFindingRow) => keptFindingRow.id))

	return scriptChapters.flatMap((scriptChapter, position) => {
		// a chapter needs the Finding that it was planned from and the times that its audio plays at
		const plannedFinding = plannedFindings.find(({ findingId }) => findingId === scriptChapter.findingId)
		const chapterTime = encodedPodcastEpisode.chapterTimes[position]
		if (!plannedFinding || !chapterTime) {
			return []
		}
		return [
			{
				podcastEpisodeId,
				position,
				findingId: keptFindingIds.has(plannedFinding.findingId) ? plannedFinding.findingId : null,
				resourceId: plannedFinding.resourceId,
				title: scriptChapter.title,
				sourceUrl: plannedFinding.sourceUrl,
				...chapterTime,
			},
		]
	})
}

// write the chapters and the published row in one transaction, with the replaced short Podcast Episodes removed.
// return the episode number that the Podcast Episode took and the Podcast Episodes that it replaced.
// the season is the publish time's UTC year, and the episode number is one more than the Topic's highest in that season
async function savePodcastEpisodeAsPublished({
	topicId,
	podcastEpisodeId,
	podcastEpisodeScript,
	podcastEpisodeChapterRows,
	encodedPodcastEpisode,
	publishedAt,
	isShort,
}: SavePodcastEpisodeAsPublishedOptions): Promise<SavedPodcastEpisode> {
	const season = publishedAt.getUTCFullYear()
	return db.transaction(async (transaction) => {
		// take the next episode number in the season. a removed Podcast Episode keeps its episode number, so none is reused
		const [highestPodcastEpisodeNumberRow] = await transaction
			.select({ highestPodcastEpisodeNumber: max(podcastEpisodes.episodeNumber) })
			.from(podcastEpisodes)
			.where(and(eq(podcastEpisodes.topicId, topicId), eq(podcastEpisodes.season, season)))
		const podcastEpisodeNumber = (highestPodcastEpisodeNumberRow?.highestPodcastEpisodeNumber ?? 0) + 1

		// write the chapters if there are any, then the row that publishes the Podcast Episode with its recorded script
		if (podcastEpisodeChapterRows.length > 0) {
			await transaction.insert(podcastEpisodeChapters).values(podcastEpisodeChapterRows)
		}
		await transaction
			.update(podcastEpisodes)
			.set({
				status: "published",
				script: podcastEpisodeScript,
				season,
				episodeNumber: podcastEpisodeNumber,
				audioKey: encodedPodcastEpisode.audioKey,
				audioByteSize: encodedPodcastEpisode.audioByteSize,
				durationSeconds: encodedPodcastEpisode.durationSeconds,
				publishedAt,
			})
			.where(eq(podcastEpisodes.id, podcastEpisodeId))

		// a short Podcast Episode replaces the Topic's earlier short ones, and a full one replaces none
		const replacedPodcastEpisodes = isShort
			? await replaceShortPodcastEpisodes({ transaction, topicId, podcastEpisodeId })
			: []
		return { podcastEpisodeNumber, replacedPodcastEpisodes }
	})
}

// remove the Topic's other published short Podcast Episodes and keep their chapters, so their Findings stay narrated.
// return the removed Podcast Episodes
async function replaceShortPodcastEpisodes({
	transaction,
	topicId,
	podcastEpisodeId,
}: ReplaceShortPodcastEpisodesOptions): Promise<ReplacedPodcastEpisode[]> {
	// find the Topic's other published short Podcast Episodes. a full Podcast Episode is never replaced
	const replacedPodcastEpisodes = await transaction
		.select({ id: podcastEpisodes.id, script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.where(
			and(
				eq(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodes.status, "published"),
				eq(podcastEpisodes.isShort, true),
				ne(podcastEpisodes.id, podcastEpisodeId),
			),
		)

	// mark them removed, if there are any
	if (replacedPodcastEpisodes.length > 0) {
		const replacedPodcastEpisodeIds = replacedPodcastEpisodes.map((replacedPodcastEpisode) => replacedPodcastEpisode.id)
		await markPodcastEpisodesRemoved(transaction, replacedPodcastEpisodeIds)
	}
	return replacedPodcastEpisodes
}

// delete the replaced Podcast Episodes' audio after the publish commits.
// a failed delete is reported and leaves the audio objects in place
async function deleteReplacedPodcastEpisodeAudio(
	podcastEpisodeId: string,
	replacedPodcastEpisodes: ReplacedPodcastEpisode[],
): Promise<void> {
	try {
		await Promise.all(
			replacedPodcastEpisodes.map((replacedPodcastEpisode) => deletePodcastEpisodeAudio(replacedPodcastEpisode)),
		)
	} catch (error) {
		reportError(error, "podcast-episode", { podcastEpisodeId })
	}
}

// tell IndexNow about a public Topic's new podcast episode page. a private or invite Topic's episode page is noindex
async function notifyPodcastEpisodePage({
	topicId,
	season,
	podcastEpisodeNumber,
}: NotifyPodcastEpisodePageOptions): Promise<void> {
	const [topic] = await db
		.select({ id: topics.id, name: topics.name, visibility: topics.visibility })
		.from(topics)
		.where(eq(topics.id, topicId))

	// tell IndexNow only about a public Topic, and only if the app's base url is configured
	const appUrl = appBaseUrl()
	if (topic?.visibility !== "public" || !appUrl) {
		return
	}
	await notifyIndexNow([`${appUrl}${toPodcastEpisodePath(topic, { season, episodeNumber: podcastEpisodeNumber })}`])
}
