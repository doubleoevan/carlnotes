// how a Podcast Episode's render ends. published with its season, its episode number, and its chapters,
// or failed with its reason
import { appBaseUrl } from "@shared/appUrl"
import type { PodcastEpisodeScript } from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { toPodcastEpisodePath } from "@shared/seo"
import { and, eq, inArray, max } from "drizzle-orm"
import { db, isUniqueViolation } from "../../db"
import { deletePodcastFeedCache } from "../../db/podcastFeedCache"
import { findings, podcastEpisodeChapters, podcastEpisodes, topics } from "../../db/schema"
import { notifyIndexNow } from "../indexNow"
import { deleteAttachment, toPodcastEpisodeChapterKey } from "../store"
import { tracePodcastEpisodeRender } from "../telemetry"
import type { PlannedFinding } from "./planPodcastEpisode"
import type { EncodedPodcastEpisode } from "./podcastEpisodeAudio"
import { toChapterTurns, toRenderedPodcastEpisodeScript } from "./podcastEpisodeScript"
import { deletePodcastEpisodeAudio } from "./removePodcastEpisode"

// how many times a publish tries to take the next episode number, if another publish of the Topic takes that episode number first
const PUBLISH_ATTEMPTS = 3

// a publish. the Podcast Episode, its planned Findings, its stored audio, its speech tier,
// each rendered chapter's attempt count, and the script positions of the chapters that rendered
export type PublishPodcastEpisodeOptions = {
	podcastEpisodeId: string
	plannedFindings: PlannedFinding[]
	encodedPodcastEpisode: EncodedPodcastEpisode
	speechTier: string
	chapterAttemptCounts: number[]
	renderedChapterPositions: number[]
}

// a Podcast Episode whose render failed for good, and the reason
export type FailPodcastEpisodeOptions = { podcastEpisodeId: string; reason: string }

// what one publish attempt writes. the Topic, the Podcast Episode, the script of its rendered chapters,
// its chapter rows, its stored audio, and the publish time
type SavePodcastEpisodeAsPublishedOptions = {
	topicId: string
	podcastEpisodeId: string
	podcastEpisodeScript: PodcastEpisodeScript
	podcastEpisodeChapterRows: (typeof podcastEpisodeChapters.$inferInsert)[]
	encodedPodcastEpisode: EncodedPodcastEpisode
	publishedAt: Date
}

// a published Podcast Episode's page. its Topic, its season, and its episode number
type NotifyPodcastEpisodePageOptions = { topicId: string; season: number; podcastEpisodeNumber: number }

/**
 * Publishes a rendered Podcast Episode with its season, its episode number, its chapters, and its stored audio's key and size.
 * Then deletes the Topic's cached feeds and tells IndexNow about a public Topic's new podcast episode page.
 */
export async function publishPodcastEpisode({
	podcastEpisodeId,
	plannedFindings,
	encodedPodcastEpisode,
	speechTier,
	chapterAttemptCounts,
	renderedChapterPositions,
}: PublishPodcastEpisodeOptions): Promise<void> {
	// publish only a rendering Podcast Episode. a retry after a saved publish writes nothing
	const [podcastEpisode] = await db.select().from(podcastEpisodes).where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (podcastEpisode?.status !== "rendering") {
		return
	}

	// throw an error if the Podcast Episode has no Topic or no script
	if (!podcastEpisode.topicId || !podcastEpisode.script) {
		throw new Error(`episode ${podcastEpisodeId} has no topic or no script to publish`)
	}

	// delete the chapters' audio, which the join leaves in place for a retried join to read
	await Promise.all(
		renderedChapterPositions.map((position) =>
			deleteAttachment(toPodcastEpisodeChapterKey(podcastEpisodeId, position)),
		),
	)

	// leave out each chapter whose speech failed for good, with the turns that render with that chapter,
	// and report how many chapters were left out
	const renderedScript = toRenderedPodcastEpisodeScript(podcastEpisode.script, renderedChapterPositions)
	const leftOutChapterCount = toChapterTurns(podcastEpisode.script).length - renderedChapterPositions.length
	if (leftOutChapterCount > 0) {
		reportError(new Error("an episode left out a chapter whose speech did not render"), "podcast-episode", {
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
		podcastEpisodeScript: renderedScript,
		plannedFindings,
		encodedPodcastEpisode,
	})
	const publishedAt = new Date()
	let podcastEpisodeNumber: number | undefined
	for (let attempt = 1; podcastEpisodeNumber === undefined; attempt++) {
		try {
			podcastEpisodeNumber = await savePodcastEpisodeAsPublished({
				topicId: podcastEpisode.topicId,
				podcastEpisodeId,
				podcastEpisodeScript: renderedScript,
				podcastEpisodeChapterRows,
				encodedPodcastEpisode,
				publishedAt,
			})
		} catch (error) {
			if (!isUniqueViolation(error) || attempt >= PUBLISH_ATTEMPTS) {
				throw error
			}
		}
	}

	// trace the render with what it took, then delete the Topic's cached feeds,
	// and tell IndexNow about a public Topic's podcast episode page
	const audioMinutes = encodedPodcastEpisode.durationSeconds / 60
	const costDollars = Number(podcastEpisode.cost)
	await tracePodcastEpisodeRender({
		podcastEpisodeId,
		topicId: podcastEpisode.topicId,
		scanId: podcastEpisode.scanId,
		speechTier,
		chapterAttemptCounts,
		renderSeconds: Math.round((publishedAt.getTime() - podcastEpisode.createdAt.getTime()) / 1000),
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
 * Saves a rendering Podcast Episode as failed with its reason, deletes the audio that the render left,
 * and reports the failure.
 */
export async function failPodcastEpisode({ podcastEpisodeId, reason }: FailPodcastEpisodeOptions): Promise<void> {
	// fail only a rendering Podcast Episode
	const [failedPodcastEpisode] = await db
		.update(podcastEpisodes)
		.set({ status: "failed", error: reason })
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), eq(podcastEpisodes.status, "rendering")))
		.returning({
			id: podcastEpisodes.id,
			topicId: podcastEpisodes.topicId,
			scanId: podcastEpisodes.scanId,
			script: podcastEpisodes.script,
		})
	if (!failedPodcastEpisode) {
		return
	}

	// delete any audio that the render left behind
	await deletePodcastEpisodeAudio(failedPodcastEpisode)

	// report the failure with its Topic and its Scan
	console.error(`episode ${podcastEpisodeId} failed to render: ${reason}`)
	reportError(new Error("an episode failed to render"), "podcast-episode", {
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
		// a chapter needs the Finding that it was planned from and the times that its audio rendered at
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

// write the chapters and the published row in one transaction, and return the episode number that the Podcast Episode took.
// the season is the publish time's UTC year, and the episode number is one more than the Topic's highest in that season
async function savePodcastEpisodeAsPublished({
	topicId,
	podcastEpisodeId,
	podcastEpisodeScript,
	podcastEpisodeChapterRows,
	encodedPodcastEpisode,
	publishedAt,
}: SavePodcastEpisodeAsPublishedOptions): Promise<number> {
	const season = publishedAt.getUTCFullYear()
	return db.transaction(async (transaction) => {
		// take the next episode number in the season. a removed Podcast Episode keeps its episode number, so none is reused
		const [highestPodcastEpisodeNumberRow] = await transaction
			.select({ highestPodcastEpisodeNumber: max(podcastEpisodes.episodeNumber) })
			.from(podcastEpisodes)
			.where(and(eq(podcastEpisodes.topicId, topicId), eq(podcastEpisodes.season, season)))
		const podcastEpisodeNumber = (highestPodcastEpisodeNumberRow?.highestPodcastEpisodeNumber ?? 0) + 1

		// write the chapters if there are any, then the row that publishes the Podcast Episode with its rendered script
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
		return podcastEpisodeNumber
	})
}

// tell IndexNow about a public Topic's new podcast episode page. a private or invite Topic has no public page
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
