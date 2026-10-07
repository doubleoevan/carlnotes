// whether a Scan renders a Podcast Episode. the checks that stop a render before it spends,
// and the Findings that the Podcast Episode narrates
import { podcastEpisodeSpeechModel } from "@shared/podcastEpisodes"
import { desc, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { canRenderPodcastEpisode, isPodcastEpisodeBudgetShareExhausted } from "../../db/quotas"
import { findings, podcastEpisodeChapters, podcastEpisodes, resources, scans, topics } from "../../db/schema"
import { toCanonicalUrl } from "../ingest/normalize"
import { loadBookmarkedFindingRows } from "../review"
import { loadUrlSourcePageUrls } from "../review/filter"
import { clampScore } from "../review/score"

// how many Findings one Podcast Episode narrates at most
export const MAX_PODCAST_EPISODE_FINDINGS = 15

// the score bonus that a bookmark, a thumbs up, and a url Source's own page each give a Finding when picking a Podcast
// Episode's Findings. the three add up, and the score stays at 1 or below
const PODCAST_EPISODE_SCORE_BONUS = 0.2

// a Finding planned for a Podcast Episode, with its Resource and its source url
export type PlannedFinding = { findingId: string; resourceId: string; sourceUrl: string }

// the Podcast Episode that a Scan renders. its row's id, and the Findings that it narrates in order
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
// and the Scan whose Findings go first
export type ToPlannedFindingsOptions = {
	topicFindingRows: TopicFindingRow[]
	narratedResourceIds: Set<string>
	scanId: string
}

/**
 * Decides whether a Scan renders a Podcast Episode and creates the Podcast Episode's row if it does.
 * Returns the plan, or null if the Scan renders no Podcast Episode.
 */
export async function planPodcastEpisode({
	scanId,
	topicId,
	billedUserId,
}: PlanPodcastEpisodeOptions): Promise<PodcastEpisodePlan | null> {
	// render no Podcast Episode if no speech model is configured
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

	// skip a Scan that leaves nothing new to narrate
	const plannedFindings = await loadPlannedFindings({ scanId, topic })
	if (plannedFindings.length === 0) {
		return skipPodcastEpisode({ scanId, skipReason: "nothing new is left to narrate" })
	}

	// reuse the row that an earlier attempt created if it is still rendering. that row already passed the checks.
	// a published, failed, or removed row plans nothing
	const [existingPodcastEpisode] = await db
		.select({ id: podcastEpisodes.id, status: podcastEpisodes.status })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.scanId, scanId))
	if (existingPodcastEpisode) {
		const { id: podcastEpisodeId, status } = existingPodcastEpisode
		return status === "rendering" ? { podcastEpisodeId, plannedFindings } : null
	}

	// the checks that stop a render before it spends. the owner's plan funds the Topic,
	// and the billed user's budget pays for this Podcast Episode
	if (!(await canRenderPodcastEpisode(topic))) {
		return skipPodcastEpisode({ scanId, skipReason: "the owner's plan has used this topic's episode" })
	}
	if (await isPodcastEpisodeBudgetShareExhausted(billedUserId)) {
		const skipReason = "the billed user's monthly spend is past the share that episodes may use"
		return skipPodcastEpisode({ scanId, skipReason })
	}

	// create the row as rendering, with the speech model that renders the Podcast Episode
	const [createdPodcastEpisode] = await db
		.insert(podcastEpisodes)
		.values({ topicId, ownerId: billedUserId, scanId, model: speechModel })
		.returning({ id: podcastEpisodes.id })

	// return the plan, or throw an error if the insert returned no row
	if (!createdPodcastEpisode) {
		throw new Error(`the episode row for scan ${scanId} was not created`)
	}
	return { podcastEpisodeId: createdPodcastEpisode.id, plannedFindings }
}

/**
 * Picks a Topic's Findings for a Podcast Episode by score with its bonuses, and orders the picked Findings with the Scan's own first.
 */
export function toPlannedFindings({
	topicFindingRows,
	narratedResourceIds,
	scanId,
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
	const pickedFindingRows = new Set(rankedFindingRows.slice(0, MAX_PODCAST_EPISODE_FINDINGS))
	const isFindingPicked = (topicFindingRow: TopicFindingRow): boolean => pickedFindingRows.has(topicFindingRow)

	// return the picked Findings with the Scan's own first, then fill the rest of the limit with the Topic's other Findings
	return [
		...scanFindingRows.filter(isFindingPicked),
		...scoreBonusFindingRows.filter(isFindingPicked),
		...otherUnnarratedFindingRows,
		...otherNarratedFindingRows,
	]
		.slice(0, MAX_PODCAST_EPISODE_FINDINGS)
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

// log why a Scan renders no Podcast Episode, and return null as its plan
function skipPodcastEpisode({ scanId, skipReason }: { scanId: string; skipReason: string }): null {
	console.log(`scan ${scanId} renders no episode: ${skipReason}`)
	return null
}

// load the Topic's Findings in narration order, with the narrated ones last
async function loadPlannedFindings({
	scanId,
	topic,
}: {
	scanId: string
	topic: typeof topics.$inferSelect
}): Promise<PlannedFinding[]> {
	// load the Resources that the Topic's Podcast Episodes narrated, the Findings that someone with access bookmarked,
	// and the pages of the Topic's url Sources. a failed or removed Podcast Episode has no chapters
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
	return toPlannedFindings({ topicFindingRows, narratedResourceIds, scanId })
}
