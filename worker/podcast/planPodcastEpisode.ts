// whether a Scan renders a Podcast Episode. the checks that stop a render before it spends,
// and the Findings that the Podcast Episode narrates
import { podcastEpisodeSpeechModel } from "@shared/podcastEpisodes"
import { desc, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { canRenderPodcastEpisode, isPodcastEpisodeBudgetShareExhausted } from "../../db/quotas"
import { findings, podcastEpisodeChapters, podcastEpisodes, resources, scans, topics } from "../../db/schema"
import { loadBookmarkedFindingRows } from "../review"

// how many Findings one Podcast Episode narrates at most
export const MAX_PODCAST_EPISODE_FINDINGS = 15

// a Finding planned for a Podcast Episode, with its Resource and its source url
export type PlannedFinding = { findingId: string; resourceId: string; sourceUrl: string }

// the Podcast Episode that a Scan renders. its row's id, and the Findings that it narrates in order
export type PodcastEpisodePlan = { podcastEpisodeId: string; plannedFindings: PlannedFinding[] }

// the Scan that a Podcast Episode is planned for, its Topic, and the user that the Podcast Episode's calls bill
export type PlanPodcastEpisodeOptions = { scanId: string; topicId: string; billedUserId: string }

// one of a Topic's Findings, with the Scan that found it, a user's rating of it, and whether a user bookmarked it
export type TopicFindingRow = PlannedFinding & {
	scanId: string
	rating: (typeof findings.$inferSelect)["rating"]
	isBookmarked: boolean
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
 * Orders a Topic's Findings for a Podcast Episode, the Scan's own first and liked or bookmarked ones next.
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

	// split the rest into the Findings that a user rated thumbs up or bookmarked,
	// the others that no Podcast Episode narrated, and the others that a Podcast Episode narrated
	const isLikedOrBookmarked = (topicFindingRow: TopicFindingRow): boolean =>
		topicFindingRow.rating === "up" || topicFindingRow.isBookmarked
	const likedOrBookmarkedFindingRows = narratableFindingRows.filter(
		(topicFindingRow) => !scanFindingRows.includes(topicFindingRow) && isLikedOrBookmarked(topicFindingRow),
	)
	const otherUnnarratedFindingRows = unnarratedFindingRows.filter(
		(topicFindingRow) => topicFindingRow.scanId !== scanId && !isLikedOrBookmarked(topicFindingRow),
	)
	const otherNarratedFindingRows = narratableFindingRows.filter(
		(topicFindingRow) => isNarrated(topicFindingRow) && !isLikedOrBookmarked(topicFindingRow),
	)

	// put the liked and bookmarked Findings right after the Scan's own, ahead of the Topic's others, and stop at the limit
	return [
		...scanFindingRows,
		...likedOrBookmarkedFindingRows,
		...otherUnnarratedFindingRows,
		...otherNarratedFindingRows,
	]
		.slice(0, MAX_PODCAST_EPISODE_FINDINGS)
		.map(({ findingId, resourceId, sourceUrl }) => ({ findingId, resourceId, sourceUrl }))
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
	// load the Resources that the Topic's Podcast Episodes narrated, and the Findings that someone with access bookmarked.
	// a failed or removed Podcast Episode has no chapters
	const [narratedChapterRows, bookmarkedFindingRows] = await Promise.all([
		db
			.select({ resourceId: podcastEpisodeChapters.resourceId })
			.from(podcastEpisodeChapters)
			.innerJoin(podcastEpisodes, eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodes.id))
			.where(eq(podcastEpisodes.topicId, topic.id)),
		loadBookmarkedFindingRows(topic.id, topic),
	])

	// load the Topic's Findings, best first, each marked if it is bookmarked
	const bookmarkedFindingIds = bookmarkedFindingRows.map(({ findingId }) => findingId)
	const topicFindingRows = await db
		.select({
			findingId: findings.id,
			resourceId: findings.resourceId,
			sourceUrl: resources.url,
			scanId: findings.scanId,
			rating: findings.rating,
			isBookmarked: inArray(findings.id, bookmarkedFindingIds).mapWith(Boolean),
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topic.id))
		.orderBy(desc(findings.relevanceScore))

	// order the Findings, with the narrated ones last
	const narratedResourceIds = new Set(narratedChapterRows.map((narratedChapterRow) => narratedChapterRow.resourceId))
	return toPlannedFindings({ topicFindingRows, narratedResourceIds, scanId })
}
