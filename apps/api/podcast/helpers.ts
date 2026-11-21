// the podcast reads of a topic's page: its podcast and a season's podcast episodes, each limited to what the user may
// listen to
import type { PodcastEpisodeCard } from "@carlnotes/contracts/home"
import type {
	PodcastEpisode,
	PodcastEpisodeSummary,
	SeasonPodcastEpisodes,
	TopicPodcast,
} from "@carlnotes/contracts/podcast"
import { toPodcastFeedPath, toPodcastVideoFeedPath } from "@carlnotes/contracts/seo"
import type { ReactionSummary } from "@carlnotes/contracts/social"
import type { TopicScan } from "@carlnotes/contracts/topics"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { isAllowed } from "../authorization"
import { loadPodcastEpisodeCardsFromRows } from "../home/topicCards"
import {
	loadAccessiblePodcastEpisode,
	loadPodcastEpisodeListenRows,
	loadPublishedAndNewestPodcastEpisodeRows,
	loadPublishedPodcastEpisodeRows,
	type PodcastEpisodeRow,
	type PodcastEpisodeTopic,
	type PublishedAndNewestPodcastEpisodeRows,
	type TopicRow,
} from "./podcastEpisodeRows"
import {
	loadPodcastEpisodeSummaries,
	loadPodcastEpisodes,
	loadTopicVideos,
	type TopicVideos,
	toPodcastEpisode,
} from "./podcastEpisodeShapes"

// the topic page's podcast, its latest podcast episode with chapters, and each scan's published podcast episode
// by the scan's id
type TopicPodcastFields = {
	podcast: TopicPodcast | null
	latestPodcastEpisode: PodcastEpisode | null
	topicPodcastEpisodeVideoCards: PodcastEpisodeCard[]
	podcastEpisodeByScanId: Map<string, TopicScan["podcastEpisode"]>
}

// the topic, the user, the season to load podcast episodes for, and whether to keep only the ones with a ready film
type LoadSeasonPodcastEpisodesOptions = {
	topic: TopicRow
	userId: string | null
	season: number
	hasVideo?: "true" | "false"
}

// the published and newest podcast episode rows the topic page already started reading, the page's reaction read,
// which includes the published podcast episodes for the film cards, and the ids of the scans that a page of the scan
// history lists, if the page holds one page
type TopicPodcastReads = {
	publishedAndNewestPodcastEpisodeRows?: Promise<PublishedAndNewestPodcastEpisodeRows>
	pageReactionRead?: Promise<{ reactionSummaryByTarget: Map<string, ReactionSummary> }>
	pageScanIds?: Promise<ReadonlySet<string>>
}

/**
 * Loads the topic page's podcast, or a null podcast if episode recording is not configured.
 */
export async function loadTopicPodcast(
	topic: TopicRow,
	userId: string | null,
	{ publishedAndNewestPodcastEpisodeRows, pageReactionRead, pageScanIds }: TopicPodcastReads = {},
): Promise<TopicPodcastFields> {
	if (!isPodcastEpisodeRecordingConfigured()) {
		return {
			podcast: null,
			latestPodcastEpisode: null,
			topicPodcastEpisodeVideoCards: [],
			podcastEpisodeByScanId: new Map(),
		}
	}

	// load the published podcast episodes that the user may listen to, newest first, and the newest podcast episode that
	// was not removed, in one read. check whether the owner's plan gets full podcast episodes and whether the user may
	// remove a podcast episode
	const [{ publishedPodcastEpisodeRows, newestPodcastEpisodeRow }, hasFullPodcastEpisodes, canRemovePodcastEpisodes] =
		await Promise.all([
			publishedAndNewestPodcastEpisodeRows ?? loadPublishedAndNewestPodcastEpisodeRows(topic, userId),
			isAllowed(topic.ownerId, "podcastEpisode:full", topic),
			isAllowed(userId, "podcastEpisode:remove", topic),
		])
	const [latestPublishedPodcastEpisodeRow] = publishedPodcastEpisodeRows
	const seasons = [
		...new Set(publishedPodcastEpisodeRows.flatMap((podcastEpisodeRow) => podcastEpisodeRow.season ?? [])),
	]

	// the ready and the rendering films of the published podcast episodes, read once for every list below, and the
	// newest published podcast episode with a ready one, which the topic video section shows
	const topicVideos = await loadTopicVideos(
		publishedPodcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id),
	)
	const latestFilmRow = publishedPodcastEpisodeRows.find((podcastEpisodeRow) =>
		topicVideos.readyTopicVideos.has(podcastEpisodeRow.id),
	)

	// the latest podcast episode and the latest film's podcast episode, listed once if they are the same one
	const playerPodcastEpisodeRows = [...new Set([latestPublishedPodcastEpisodeRow, latestFilmRow])].flatMap(
		(podcastEpisodeRow) => podcastEpisodeRow ?? [],
	)

	// whether the newest podcast episode is recording or failed to record, and the published podcast episodes that the
	// listed scans recorded
	const isNewestPodcastEpisodeUnpublished =
		newestPodcastEpisodeRow?.status === "recording" || newestPodcastEpisodeRow?.status === "failed"
	const scanPodcastEpisodeRows = toScanPodcastEpisodeRows(publishedPodcastEpisodeRows, await pageScanIds)

	// the unpublished newest podcast episode if the user may see it, the player's podcast episodes with their chapters,
	// the latest season's podcast episodes, each scan's podcast episode summary, and the ready films' cards from the rows
	// read above
	// ponytail: the whole latest season goes with every topic page. page the list if a season reaches the hundreds
	const [latestSeason] = seasons
	// ponytail: every ready film's card goes with every topic page. page the cards on the server if a topic reaches the
	// hundreds of films
	const [
		accessibleUnpublishedPodcastEpisode,
		playerPodcastEpisodes,
		latestSeasonPodcastEpisodes,
		scanPodcastEpisodeSummaries,
		topicPodcastEpisodeVideoCards,
	] = await Promise.all([
		newestPodcastEpisodeRow && isNewestPodcastEpisodeUnpublished
			? loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: newestPodcastEpisodeRow.id })
			: null,
		loadPodcastEpisodes({
			podcastEpisodeRowTopics: playerPodcastEpisodeRows.map((podcastEpisodeRow) => ({ podcastEpisodeRow, topic })),
			userId,
			topicVideos,
		}),
		latestSeason === undefined
			? { podcastEpisodes: [] }
			: toSeasonPodcastEpisodes({
					topic,
					publishedPodcastEpisodeRows,
					userId,
					season: latestSeason,
					topicVideos,
				}),
		loadPodcastEpisodeSummaries(
			scanPodcastEpisodeRows.map((podcastEpisodeRow) => ({ podcastEpisodeRow, topic })),
			topicVideos,
		),
		loadPodcastEpisodeCardsFromRows(
			publishedPodcastEpisodeRows.flatMap((podcastEpisodeRow) =>
				topicVideos.readyTopicVideos.has(podcastEpisodeRow.id) ? { podcastEpisodeRow, topic } : [],
			),
			{
				topicVideos,
				reactionSummaryByTarget: pageReactionRead?.then(({ reactionSummaryByTarget }) => reactionSummaryByTarget),
			},
		),
	])

	// the latest podcast episode, and the latest film, or null if no podcast episode has a ready film
	const playerPodcastEpisodeById = new Map(
		playerPodcastEpisodes.map((podcastEpisode) => [podcastEpisode.id, podcastEpisode]),
	)
	const latestPodcastEpisode = playerPodcastEpisodeById.get(latestPublishedPodcastEpisodeRow?.id ?? "") ?? null
	const latestFilmPodcastEpisode = playerPodcastEpisodeById.get(latestFilmRow?.id ?? "")
	const topicPodcastEpisodeVideoSection = latestFilmPodcastEpisode ? { podcastEpisode: latestFilmPodcastEpisode } : null

	// the podcast with its episodes and feed, the latest podcast episode, the films' cards, and each scan's podcast
	// episode
	return {
		podcast: {
			isEnabled: topic.isPodcastEnabled,
			isCommentsEnabled: topic.isPodcastCommentsEnabled,
			hasFullPodcastEpisodes,
			canRemovePodcastEpisodes,
			unpublishedPodcastEpisode: accessibleUnpublishedPodcastEpisode
				? toPodcastEpisode({ podcastEpisodeRow: accessibleUnpublishedPodcastEpisode.podcastEpisodeRow, topic })
				: null,
			seasons,
			latestSeasonPodcastEpisodes,
			// a public topic's podcast feed url, once the topic has a published podcast episode
			publicFeedUrl:
				topic.visibility === "public" && latestPublishedPodcastEpisodeRow ? toPodcastFeedPath(topic.id) : null,
			// the latest film, and a public topic's film feed url once the topic has a film
			topicPodcastEpisodeVideoSection: topicPodcastEpisodeVideoSection,
			publicVideoFeedUrl:
				topic.visibility === "public" && topicPodcastEpisodeVideoSection ? toPodcastVideoFeedPath(topic.id) : null,
		},
		latestPodcastEpisode,
		topicPodcastEpisodeVideoCards,
		podcastEpisodeByScanId: toPodcastEpisodeByScanId(scanPodcastEpisodeRows, scanPodcastEpisodeSummaries),
	}
}

/**
 * Loads the published podcast episodes that the user may listen to of the scans listed, by the scan's id.
 */
export async function loadScanPodcastEpisodes({
	topic,
	userId,
	scanIds,
}: {
	topic: TopicRow
	userId: string | null
	scanIds: ReadonlySet<string>
}): Promise<Map<string, TopicScan["podcastEpisode"]>> {
	// the listed scans' published podcast episodes, then their summaries
	const scanPodcastEpisodeRows = toScanPodcastEpisodeRows(await loadPublishedPodcastEpisodeRows(topic, userId), scanIds)
	const scanPodcastEpisodeSummaries = await loadPodcastEpisodeSummaries(
		scanPodcastEpisodeRows.map((podcastEpisodeRow) => ({ podcastEpisodeRow, topic })),
	)
	return toPodcastEpisodeByScanId(scanPodcastEpisodeRows, scanPodcastEpisodeSummaries)
}

// the published podcast episodes that a scan recorded, of the listed scans alone if a list is given
function toScanPodcastEpisodeRows(
	publishedPodcastEpisodeRows: PodcastEpisodeRow[],
	scanIds: ReadonlySet<string> | undefined,
): PodcastEpisodeRow[] {
	return publishedPodcastEpisodeRows.filter(
		(podcastEpisodeRow) => podcastEpisodeRow.scanId && (!scanIds || scanIds.has(podcastEpisodeRow.scanId)),
	)
}

// each scan's published podcast episode summary that has its season and number, by the scan's id. the summaries are
// in their rows' order
function toPodcastEpisodeByScanId(
	scanPodcastEpisodeRows: PodcastEpisodeRow[],
	scanPodcastEpisodeSummaries: PodcastEpisodeSummary[],
): Map<string, TopicScan["podcastEpisode"]> {
	const podcastEpisodeByScanId = new Map<string, TopicScan["podcastEpisode"]>()
	for (const [i, podcastEpisodeSummary] of scanPodcastEpisodeSummaries.entries()) {
		// keep a summary whose row names a scan, with the season and number its publish assigned
		const scanId = scanPodcastEpisodeRows[i]?.scanId
		const { season, episodeNumber } = podcastEpisodeSummary
		if (scanId && season !== null && episodeNumber !== null) {
			podcastEpisodeByScanId.set(scanId, { ...podcastEpisodeSummary, season, episodeNumber })
		}
	}
	return podcastEpisodeByScanId
}

/**
 * Loads a season's published podcast episodes that the user may listen to, newest first, without their chapters.
 */
export async function loadSeasonPodcastEpisodes({
	topic,
	userId,
	season,
	hasVideo,
}: LoadSeasonPodcastEpisodesOptions): Promise<SeasonPodcastEpisodes> {
	// load the topic's published podcast episodes, and keep the season's podcast episodes
	const publishedPodcastEpisodeRows = await loadPublishedPodcastEpisodeRows(topic, userId)
	const seasonPodcastEpisodes = await toSeasonPodcastEpisodes({ topic, publishedPodcastEpisodeRows, userId, season })

	// a released mobile build's films list asks for the podcast episodes with a ready film
	if (hasVideo !== "true") {
		return seasonPodcastEpisodes
	}
	return { podcastEpisodes: seasonPodcastEpisodes.podcastEpisodes.filter((podcastEpisode) => podcastEpisode.video) }
}

// the topic's published podcast episodes that are already loaded, the user, the season to build, and the films if a
// caller loaded them
type ToSeasonPodcastEpisodesOptions = {
	topic: PodcastEpisodeTopic
	publishedPodcastEpisodeRows: PodcastEpisodeRow[]
	userId: string | null
	season: number
	topicVideos?: TopicVideos
}

// a season's podcast episodes, with the user's progress through each
async function toSeasonPodcastEpisodes({
	topic,
	publishedPodcastEpisodeRows,
	userId,
	season,
	topicVideos: loadedTopicVideos,
}: ToSeasonPodcastEpisodesOptions): Promise<SeasonPodcastEpisodes> {
	// keep the season's podcast episodes, and attach the user's progress and the film to each
	const seasonPodcastEpisodeRows = publishedPodcastEpisodeRows.filter(
		(podcastEpisodeRow) => podcastEpisodeRow.season === season,
	)
	const seasonPodcastEpisodeIds = seasonPodcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id)
	const [podcastEpisodeListenRows, { readyTopicVideos, videoRenderingPodcastEpisodeIds }] = await Promise.all([
		loadPodcastEpisodeListenRows(userId, seasonPodcastEpisodeIds),
		loadedTopicVideos ?? loadTopicVideos(seasonPodcastEpisodeIds),
	])
	return {
		podcastEpisodes: seasonPodcastEpisodeRows.map((podcastEpisodeRow) =>
			toPodcastEpisode({
				podcastEpisodeRow,
				topic,
				podcastEpisodeListenRow: podcastEpisodeListenRows.find(
					(podcastEpisodeListenRow) => podcastEpisodeListenRow.podcastEpisodeId === podcastEpisodeRow.id,
				),
				readyTopicVideo: readyTopicVideos.get(podcastEpisodeRow.id),
				isVideoRendering: videoRenderingPodcastEpisodeIds.has(podcastEpisodeRow.id),
			}),
		),
	}
}
