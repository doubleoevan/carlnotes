// whether a Scan records a Podcast Episode. the checks that stop a recording before it spends,
// and the Findings that the Podcast Episode narrates
import {
	FULL_PODCAST_EPISODE_FINDINGS,
	podcastEpisodeSpeechModel,
	SHORT_PODCAST_EPISODE_FINDINGS,
} from "@shared/podcastEpisodes"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { isMonthlyBudgetCutoffPassed } from "../../db/monthlyBudgetCutoffs"
import { hasFullPodcastEpisodes } from "../../db/quotas"
import { runWithRequestMemo } from "../../db/requestMemo"
import { podcastEpisodeChapters, podcastEpisodes } from "../../db/schema/podcast"
import { findings, resources, scans } from "../../db/schema/scans"
import { topics } from "../../db/schema/topics"
import { toCanonicalUrl } from "../ingest/normalize"
import { loadBookmarkedFindingRows } from "../review"
import { loadUrlSourcePageUrls } from "../review/filter"
import { clampScore } from "../review/score"

// the score bonus that a bookmark, a thumbs up, and a url Source's own page each give a Finding when picking a Podcast
// Episode's Findings. the three add up, and the score stays at 1 or below
const PODCAST_EPISODE_SCORE_BONUS = 0.2

// a Finding planned for a Podcast Episode, with its Resource and its source url
export type PlannedFinding = { findingId: string; resourceId: string; sourceUrl: string }

// the Podcast Episode that a Scan records. its row's id, and the Findings that it narrates in order
export type PodcastEpisodePlan = { podcastEpisodeId: string; plannedFindings: PlannedFinding[] }

// the Scan that a Podcast Episode is planned for, its Topic, and the user that the Podcast Episode's calls bill
export type PlanPodcastEpisodeOptions = { scanId: string; topicId: string; billedUserId: string }

// one of a Topic's Findings, with the Scan that found the Finding, its relevance score, a user's rating of the Finding,
// whether a user bookmarked the Finding, and whether its page is one of the Topic's url Sources
export type TopicFindingRow = PlannedFinding & {
	scanId: string
	relevanceScore: number
	rating: (typeof findings.$inferSelect)["rating"]
	isBookmarked: boolean
	isUrlSourcePage: boolean
}

// the Topic's Findings best first, the Resources that a Podcast Episode already narrated,
// the Scan whose Findings go first, and how many Findings the Podcast Episode narrates at most
export type ToPlannedFindingsOptions = {
	topicFindingRows: TopicFindingRow[]
	narratedResourceIds: Set<string>
	scanId: string
	maxFindings: number
}

/**
 * Decides whether a Scan records a Podcast Episode and creates the Podcast Episode's row if it does.
 * Returns the plan, or null if the Scan records no Podcast Episode. The plan's reads share one memo, so its two cutoff
 * checks read the billed user's access row and month's spend once.
 */
export function planPodcastEpisode(
	planPodcastEpisodeOptions: PlanPodcastEpisodeOptions,
): Promise<PodcastEpisodePlan | null> {
	return runWithRequestMemo(() => planPodcastEpisodeInMemo(planPodcastEpisodeOptions))
}

// the plan's checks, its Findings, and its row, run inside the plan's memo
async function planPodcastEpisodeInMemo({
	scanId,
	topicId,
	billedUserId,
}: PlanPodcastEpisodeOptions): Promise<PodcastEpisodePlan | null> {
	// record no Podcast Episode if no speech model is configured
	const speechModel = podcastEpisodeSpeechModel()
	if (!speechModel) {
		return null
	}

	// skip a Scan that did not succeed and a Topic whose podcast is off
	const [[scan], [topic]] = await Promise.all([
		db.select({ status: scans.status }).from(scans).where(eq(scans.id, scanId)),
		db.select().from(topics).where(eq(topics.id, topicId)),
	])
	if (scan?.status !== "succeeded" || !topic?.isPodcastEnabled) {
		return skipPodcastEpisode({ scanId, skipReason: "the scan did not succeed, or the topic's podcast is off" })
	}

	// the row that an earlier attempt created, if any, and whether this Podcast Episode is short, which narrates fewer
	// Findings
	const [existingPodcastEpisode] = await db
		.select({ id: podcastEpisodes.id, status: podcastEpisodes.status, isShort: podcastEpisodes.isShort })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.scanId, scanId))
	const isShortPodcastEpisode = await isShortPodcastEpisodePlanned({
		existingPodcastEpisode,
		ownerId: topic.ownerId,
		billedUserId,
	})
	const maxFindings = isShortPodcastEpisode ? SHORT_PODCAST_EPISODE_FINDINGS : FULL_PODCAST_EPISODE_FINDINGS

	// skip a Scan that leaves nothing new to narrate
	const plannedFindings = await loadPlannedFindings({ scanId, topic, maxFindings })
	if (plannedFindings.length === 0) {
		return skipPodcastEpisode({ scanId, skipReason: "nothing new is left to narrate" })
	}

	// reuse the row that an earlier attempt created if it is still recording. that row already passed the checks.
	// a published, failed, or removed row plans nothing
	if (existingPodcastEpisode) {
		const { id: podcastEpisodeId, status } = existingPodcastEpisode
		return status === "recording" ? { podcastEpisodeId, plannedFindings } : null
	}

	// skip a new Podcast Episode that a check stops before it spends
	const skipReason = await loadPodcastEpisodeSpendSkipReason({ topicId, isShortPodcastEpisode, billedUserId })
	if (skipReason) {
		return skipPodcastEpisode({ scanId, skipReason })
	}

	// create the row as recording, with the speech model that records the Podcast Episode and whether it is short
	const [createdPodcastEpisode] = await db
		.insert(podcastEpisodes)
		.values({ topicId, ownerId: billedUserId, scanId, model: speechModel, isShort: isShortPodcastEpisode })
		.returning({ id: podcastEpisodes.id })

	// return the plan, or throw an error if the insert returned no row
	if (!createdPodcastEpisode) {
		throw new Error(`the episode row for scan ${scanId} was not created`)
	}
	return { podcastEpisodeId: createdPodcastEpisode.id, plannedFindings }
}

// the row that an earlier attempt created, the Topic's owner, and the user the Podcast Episode bills
type IsShortPodcastEpisodePlannedOptions = {
	existingPodcastEpisode: { isShort: boolean } | undefined
	ownerId: string
	billedUserId: string
}

/**
 * Whether a Podcast Episode is short. A row that an earlier attempt created keeps the length it was planned at, a Topic
 * whose owner lacks full Podcast Episodes gets a short one, and so does one whose billed user's spend is past the full
 * Podcast Episodes cutoff.
 */
export async function isShortPodcastEpisodePlanned({
	existingPodcastEpisode,
	ownerId,
	billedUserId,
}: IsShortPodcastEpisodePlannedOptions): Promise<boolean> {
	// a retry keeps the row's length, and a first attempt reads the owner's plan and the billed user's spend
	if (existingPodcastEpisode) {
		return existingPodcastEpisode.isShort
	}
	return (
		!(await hasFullPodcastEpisodes(ownerId)) || (await isMonthlyBudgetCutoffPassed(billedUserId, "fullPodcastEpisodes"))
	)
}

// the Topic that records the Podcast Episode, whether the Podcast Episode is short, and the user it bills
type LoadPodcastEpisodeSpendSkipReasonOptions = {
	topicId: string
	isShortPodcastEpisode: boolean
	billedUserId: string
}

/**
 * Returns why a new Podcast Episode stops before it spends, or null if it may record. A Topic records one short Podcast
 * Episode at a time, and the billed user's budget pays for the Podcast Episode until their spend passes the podcast
 * episodes cutoff.
 */
export async function loadPodcastEpisodeSpendSkipReason({
	topicId,
	isShortPodcastEpisode,
	billedUserId,
}: LoadPodcastEpisodeSpendSkipReasonOptions): Promise<string | null> {
	// a new short Podcast Episode stops while the Topic's short one is still recording
	if (isShortPodcastEpisode && (await hasRecordingShortPodcastEpisode(topicId))) {
		return "the topic's short podcast episode is still recording"
	}

	// the billed user's spend past the podcast episodes cutoff stops the Podcast Episode
	if (await isMonthlyBudgetCutoffPassed(billedUserId, "podcastEpisodes")) {
		return "the billed user's monthly spend is past the podcast episodes cutoff"
	}
	return null
}

/**
 * Picks a Topic's Findings for a Podcast Episode by score with its bonuses, and orders the picked Findings with the Scan's own first.
 */
export function toPlannedFindings({
	topicFindingRows,
	narratedResourceIds,
	scanId,
	maxFindings,
}: ToPlannedFindingsOptions): PlannedFinding[] {
	// leave out each Finding that a user rated thumbs down
	const narratableFindingRows = topicFindingRows.filter((topicFindingRow) => topicFindingRow.rating !== "down")

	// a Finding counts as narrated if a Podcast Episode already narrated its Resource
	const isNarrated = (topicFindingRow: TopicFindingRow): boolean => narratedResourceIds.has(topicFindingRow.resourceId)
	const unnarratedFindingRows = narratableFindingRows.filter((topicFindingRow) => !isNarrated(topicFindingRow))

	// plan nothing if every Finding was already narrated
	if (unnarratedFindingRows.length === 0) {
		return []
	}

	// take the Scan's own Findings that no Podcast Episode narrated.
	// the rows arrive best first, so each group keeps its score order
	const scanFindingRows = unnarratedFindingRows.filter((topicFindingRow) => topicFindingRow.scanId === scanId)

	// split the Topic's other Findings into bonus Findings, unnarrated Findings with no bonus, and narrated Findings.
	// a Finding has a bonus if a user liked or bookmarked the Finding, or if its page is a url Source's page
	const hasScoreBonus = (topicFindingRow: TopicFindingRow): boolean =>
		topicFindingRow.rating === "up" || topicFindingRow.isBookmarked || topicFindingRow.isUrlSourcePage
	const scoreBonusFindingRows = narratableFindingRows.filter(
		(topicFindingRow) => !scanFindingRows.includes(topicFindingRow) && hasScoreBonus(topicFindingRow),
	)
	const otherUnnarratedFindingRows = unnarratedFindingRows.filter(
		(topicFindingRow) => topicFindingRow.scanId !== scanId && !hasScoreBonus(topicFindingRow),
	)
	const otherNarratedFindingRows = narratableFindingRows.filter(
		(topicFindingRow) => isNarrated(topicFindingRow) && !hasScoreBonus(topicFindingRow),
	)

	// rank the Scan's own and the bonus Findings by score with their bonuses, and keep the best.
	// the sort is stable, so the Scan's own come first on a tie
	const rankedFindingRows = [...scanFindingRows, ...scoreBonusFindingRows].sort(
		(firstFindingRow, secondFindingRow) => toScoreWithBonuses(secondFindingRow) - toScoreWithBonuses(firstFindingRow),
	)
	const pickedFindingRows = new Set(rankedFindingRows.slice(0, maxFindings))
	const isFindingPicked = (topicFindingRow: TopicFindingRow): boolean => pickedFindingRows.has(topicFindingRow)

	// return the picked Findings with the Scan's own first, then fill the rest of the limit with the Topic's other Findings
	return [
		...scanFindingRows.filter(isFindingPicked),
		...scoreBonusFindingRows.filter(isFindingPicked),
		...otherUnnarratedFindingRows,
		...otherNarratedFindingRows,
	]
		.slice(0, maxFindings)
		.map(({ findingId, resourceId, sourceUrl }) => ({ findingId, resourceId, sourceUrl }))
}

// add a score bonus for each of a Finding's bookmark, thumbs up, and url Source page, keeping the score at 1 or below
function toScoreWithBonuses(topicFindingRow: TopicFindingRow): number {
	const bonusCount = [
		topicFindingRow.isBookmarked,
		topicFindingRow.rating === "up",
		topicFindingRow.isUrlSourcePage,
	].filter(Boolean).length
	return clampScore(topicFindingRow.relevanceScore + bonusCount * PODCAST_EPISODE_SCORE_BONUS)
}

// whether the Topic has a short Podcast Episode that is still recording
async function hasRecordingShortPodcastEpisode(topicId: string): Promise<boolean> {
	const [recordingShortPodcastEpisode] = await db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(
			and(
				eq(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodes.status, "recording"),
				eq(podcastEpisodes.isShort, true),
			),
		)
		.limit(1)
	return recordingShortPodcastEpisode !== undefined
}

// log why a Scan records no Podcast Episode, and return null as its plan
function skipPodcastEpisode({ scanId, skipReason }: { scanId: string; skipReason: string }): null {
	console.log(`scan ${scanId} records no episode: ${skipReason}`)
	return null
}

// load the Topic's Findings in narration order, with the narrated ones last, up to the Podcast Episode's limit
async function loadPlannedFindings({
	scanId,
	topic,
	maxFindings,
}: {
	scanId: string
	topic: typeof topics.$inferSelect
	maxFindings: number
}): Promise<PlannedFinding[]> {
	// load the Resources that the Topic's Podcast Episodes narrated, the Findings that someone with access bookmarked,
	// and the pages of the Topic's url Sources. a failed Podcast Episode and one that its owner removed have no
	// chapters, and a replaced short Podcast Episode keeps its chapters
	const [narratedChapterRows, bookmarkedFindingRows, urlSourcePageUrls] = await Promise.all([
		db
			.select({ resourceId: podcastEpisodeChapters.resourceId })
			.from(podcastEpisodeChapters)
			.innerJoin(podcastEpisodes, eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodes.id))
			.where(eq(podcastEpisodes.topicId, topic.id)),
		loadBookmarkedFindingRows(topic.id, topic),
		loadUrlSourcePageUrls(topic.id),
	])

	// load the Topic's Findings, best first, each marked if it is bookmarked
	const bookmarkedFindingIds = bookmarkedFindingRows.map(({ findingId }) => findingId)
	const findingRows = await db
		.select({
			findingId: findings.id,
			resourceId: findings.resourceId,
			sourceUrl: resources.url,
			scanId: findings.scanId,
			relevanceScore: findings.relevanceScore,
			rating: findings.rating,
			isBookmarked: inArray(findings.id, bookmarkedFindingIds).mapWith(Boolean),
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topic.id))
		.orderBy(desc(findings.relevanceScore))

	// mark each Finding whose page is one of the Topic's url Sources, compared by canonical url
	const urlSourcePageUrlSet = new Set(urlSourcePageUrls)
	const topicFindingRows = findingRows.map((findingRow) => ({
		...findingRow,
		isUrlSourcePage: urlSourcePageUrlSet.has(toCanonicalUrl(findingRow.sourceUrl)),
	}))

	// order the Findings, with the narrated ones last
	const narratedResourceIds = new Set(narratedChapterRows.map((narratedChapterRow) => narratedChapterRow.resourceId))
	return toPlannedFindings({ topicFindingRows, narratedResourceIds, scanId, maxFindings })
}
