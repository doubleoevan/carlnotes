// the podcast pages' reads: a topic page's podcast, a season's podcast episodes, and a podcast episode page, each limited
// to what the user may listen to
import type { PodcastEpisode, SeasonPodcastEpisodes, TopicPodcast } from "@shared/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@shared/contracts/podcastEpisodePage"
import type { TopicScan } from "@shared/contracts/topics"
import { isPodcastEpisodeRecordingConfigured } from "@shared/podcastEpisodes"
import { toPodcastFeedPath } from "@shared/seo"
import { and, desc, eq, ne } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodes } from "../../db/schema/podcast"
import { isAllowed } from "../authorization"
import { attachPodcastEpisodeChapterFaviconPaths } from "../favicons"
import { toTranscriptBlocks } from "../share/podcastFeed"
import { loadTopicAccessAndFindings } from "../topic/accessibleFindings"
import { loadTopicOwner, toTeamFields } from "../topic/helpers"
import { canRateTopic } from "../topic/permissions"
import {
	loadAccessiblePodcastEpisode,
	loadPodcastEpisodeListenRows,
	loadPublishedPodcastEpisode,
	loadPublishedPodcastEpisodeRows,
	type PodcastEpisodePageRef,
	type PodcastEpisodeRow,
	type PodcastEpisodeTopic,
	type TopicRow,
} from "./podcastEpisodeRows"
import { loadPodcastEpisode, loadPodcastEpisodeSummaries, toPodcastEpisode } from "./podcastEpisodeShapes"
import { loadRelatedPodcastEpisodeRows, loadTopicPodcastEpisodeRows } from "./relatedPodcastEpisodes"

// the topic page's podcast, its latest podcast episode with chapters, and each scan's published podcast episode
// by the scan's id
type TopicPodcastFields = {
	podcast: TopicPodcast | null
	latestPodcastEpisode: PodcastEpisode | null
	podcastEpisodeByScanId: Map<string, TopicScan["podcastEpisode"]>
}

// the topic, the user, and the season to load podcast episodes for
type LoadSeasonPodcastEpisodesOptions = { topic: TopicRow; userId: string | null; season: number }

/**
 * Loads the topic page's podcast, or a null podcast if episode recording is not configured.
 */
export async function loadTopicPodcast(topic: TopicRow, userId: string | null): Promise<TopicPodcastFields> {
	if (!isPodcastEpisodeRecordingConfigured()) {
		return { podcast: null, latestPodcastEpisode: null, podcastEpisodeByScanId: new Map() }
	}

	// load the published podcast episodes that the user may listen to, newest first, and the newest episode that was not removed.
	// check whether the owner's plan gets full episodes and whether the user may remove an episode
	const [publishedPodcastEpisodeRows, [newestPodcastEpisodeRow], hasFullPodcastEpisodes, canRemovePodcastEpisodes] =
		await Promise.all([
			loadPublishedPodcastEpisodeRows(topic, userId),
			db
				.select({ id: podcastEpisodes.id, status: podcastEpisodes.status })
				.from(podcastEpisodes)
				.where(and(eq(podcastEpisodes.topicId, topic.id), ne(podcastEpisodes.status, "removed")))
				.orderBy(desc(podcastEpisodes.createdAt))
				.limit(1),
			isAllowed(topic.ownerId, "podcastEpisode:full", topic),
			isAllowed(userId, "podcastEpisode:remove", topic),
		])
	const [latestPublishedPodcastEpisodeRow] = publishedPodcastEpisodeRows
	const seasons = [
		...new Set(publishedPodcastEpisodeRows.flatMap((podcastEpisodeRow) => podcastEpisodeRow.season ?? [])),
	]

	// the newest podcast episode, if it is recording or failed to record and the user may see it
	const isNewestPodcastEpisodeUnpublished =
		newestPodcastEpisodeRow?.status === "recording" || newestPodcastEpisodeRow?.status === "failed"
	const accessibleUnpublishedPodcastEpisode =
		newestPodcastEpisodeRow && isNewestPodcastEpisodeUnpublished
			? await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: newestPodcastEpisodeRow.id })
			: null

	// the published podcast episodes that a scan recorded
	const scanPodcastEpisodeRows = publishedPodcastEpisodeRows.filter((podcastEpisodeRow) => podcastEpisodeRow.scanId)

	// the latest podcast episode with its chapters, the latest season's episodes, and each scan's podcast episode summary
	// ponytail: the whole latest season goes with every topic page. page the list if a season reaches the hundreds
	const [latestSeason] = seasons
	const [latestPodcastEpisode, latestSeasonPodcastEpisodes, scanPodcastEpisodeSummaries] = await Promise.all([
		latestPublishedPodcastEpisodeRow
			? loadPodcastEpisode({ podcastEpisodeRow: latestPublishedPodcastEpisodeRow, topic, userId })
			: null,
		latestSeason === undefined
			? { podcastEpisodes: [] }
			: toSeasonPodcastEpisodes({ topic, publishedPodcastEpisodeRows, userId, season: latestSeason }),
		loadPodcastEpisodeSummaries(scanPodcastEpisodeRows.map((podcastEpisodeRow) => ({ podcastEpisodeRow, topic }))),
	])

	// each scan's published podcast episode summary that has its season and number, by the scan's id
	const podcastEpisodeByScanId = new Map<string, TopicScan["podcastEpisode"]>()
	for (const [i, podcastEpisodeSummary] of scanPodcastEpisodeSummaries.entries()) {
		const scanId = scanPodcastEpisodeRows[i]?.scanId
		const { season, episodeNumber } = podcastEpisodeSummary
		if (scanId && season !== null && episodeNumber !== null) {
			podcastEpisodeByScanId.set(scanId, { ...podcastEpisodeSummary, season, episodeNumber })
		}
	}

	// the podcast with its episodes and feed, the latest podcast episode, and each scan's podcast episode
	return {
		podcast: {
			isEnabled: topic.isPodcastEnabled,
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
		},
		latestPodcastEpisode,
		podcastEpisodeByScanId,
	}
}

/**
 * Loads a season's published podcast episodes that the user may listen to, newest first, without their chapters.
 */
export async function loadSeasonPodcastEpisodes({
	topic,
	userId,
	season,
}: LoadSeasonPodcastEpisodesOptions): Promise<SeasonPodcastEpisodes> {
	// load the topic's published podcast episodes, and keep the season's podcast episodes
	const publishedPodcastEpisodeRows = await loadPublishedPodcastEpisodeRows(topic, userId)
	return toSeasonPodcastEpisodes({ topic, publishedPodcastEpisodeRows, userId, season })
}

// the topic's published podcast episodes that are already loaded, the user, and the season to build
type ToSeasonPodcastEpisodesOptions = {
	topic: PodcastEpisodeTopic
	publishedPodcastEpisodeRows: PodcastEpisodeRow[]
	userId: string | null
	season: number
}

// a season's podcast episodes, with the user's progress through each
async function toSeasonPodcastEpisodes({
	topic,
	publishedPodcastEpisodeRows,
	userId,
	season,
}: ToSeasonPodcastEpisodesOptions): Promise<SeasonPodcastEpisodes> {
	// keep the season's podcast episodes, and attach the user's progress to each
	const seasonPodcastEpisodeRows = publishedPodcastEpisodeRows.filter(
		(podcastEpisodeRow) => podcastEpisodeRow.season === season,
	)
	const podcastEpisodeListenRows = await loadPodcastEpisodeListenRows(
		userId,
		seasonPodcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id),
	)
	return {
		podcastEpisodes: seasonPodcastEpisodeRows.map((podcastEpisodeRow) =>
			toPodcastEpisode({
				podcastEpisodeRow,
				topic,
				podcastEpisodeListenRow: podcastEpisodeListenRows.find(
					(podcastEpisodeListenRow) => podcastEpisodeListenRow.podcastEpisodeId === podcastEpisodeRow.id,
				),
			}),
		),
	}
}

/**
 * Loads a podcast episode's own page for a user who may listen to the episode, or null.
 */
export async function loadPodcastEpisodePage(
	podcastEpisodePageRef: PodcastEpisodePageRef,
	userId: string | null,
): Promise<PodcastEpisodePageResponse | null> {
	// the published podcast episode that the page ref names, if the user may listen to it
	const publishedPodcastEpisode = await loadPublishedPodcastEpisode(podcastEpisodePageRef)
	const accessiblePodcastEpisode = publishedPodcastEpisode
		? await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: publishedPodcastEpisode.podcastEpisodeRow.id })
		: null
	if (!accessiblePodcastEpisode) {
		return null
	}

	// load the podcast episode, its script, the findings that the user may see, whether the user may rate the findings
	// or remove the episode, the topic's byline, the owning team, the holding teams that the user is on, the topic's
	// other podcast episodes, and the related ones
	const { podcastEpisodeRow, topic, subscriberActivatedAt } = accessiblePodcastEpisode
	const podcastEpisodeId = podcastEpisodeRow.id
	const [
		[podcastEpisodeScriptRow],
		podcastEpisode,
		{ topicFindings },
		canRate,
		canRemovePodcastEpisode,
		owner,
		{ teamLink, team, roomTeams },
		topicPodcastEpisodes,
		relatedPodcastEpisodes,
	] = await Promise.all([
		db.select({ script: podcastEpisodes.script }).from(podcastEpisodes).where(eq(podcastEpisodes.id, podcastEpisodeId)),
		loadPodcastEpisode({ podcastEpisodeRow, topic, userId }),
		loadTopicAccessAndFindings({ topic, userId }),
		canRateTopic(userId, topic),
		isAllowed(userId, "podcastEpisode:remove", topic),
		// the owner and the team that the topic's byline credits
		loadTopicOwner(topic.ownerId),
		toTeamFields(topic.id, topic.teamId, userId),
		// the topic's other podcast episodes and the related ones that the user may listen to, each with its description
		// and with its chapter count for its play button
		loadTopicPodcastEpisodeRows({ podcastEpisodeId, topic, subscriberActivatedAt }).then(loadPodcastEpisodeSummaries),
		loadRelatedPodcastEpisodeRows({ podcastEpisodeId, topic, userId }).then(loadPodcastEpisodeSummaries),
	])

	// keep the findings that the chapters narrate, and fill the chapters' favicons
	const chapterFindingIds = new Set(
		podcastEpisode.chapters.map((podcastEpisodeChapter) => podcastEpisodeChapter.findingId),
	)
	const chapterTopicFindings = topicFindings.filter((topicFinding) => chapterFindingIds.has(topicFinding.findingId))
	await attachPodcastEpisodeChapterFaviconPaths(podcastEpisode.chapters)
	const { id, name, prompt, visibility } = topic
	return {
		podcastEpisode,
		topic: { id, name, prompt, visibility, owner, teamLink, team, roomTeams, isTopicOwner: topic.ownerId === userId },
		topicFindings: chapterTopicFindings,
		canRate,
		canRemovePodcastEpisode,
		transcript: podcastEpisodeScriptRow?.script ? toTranscriptBlocks(podcastEpisodeScriptRow.script) : [],
		topicPodcastEpisodes,
		relatedPodcastEpisodes,
	}
}
