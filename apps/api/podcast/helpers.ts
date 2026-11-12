// the podcast pages' reads: a topic page's podcast, a season's podcast episodes, and a podcast episode page, each limited
// to what the user may listen to
import type {
	PodcastEpisode,
	PodcastEpisodeSummary,
	SeasonPodcastEpisodes,
	TopicPodcast,
} from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toPodcastFeedPath, toPodcastVideoFeedPath } from "@carlnotes/contracts/seo"
import type { TopicScan } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { and, desc, eq, ne } from "drizzle-orm"
import { isAllowed, loadUserAccess } from "../authorization"
import { attachPodcastEpisodeChapterFaviconPaths } from "../favicons"
import { toTranscriptBlocks } from "../share/podcastFeed"
import { attachReactionSummaries } from "../social/findingReactions"
import { loadPageCommentThread } from "../social/pageCommentThread"
import { loadTopicAccessAndFindings } from "../topic/accessibleFindings"
import { canRateTopic } from "../topic/findingPermissions"
import { loadTopicOwner, toTeamFields } from "../topic/helpers"
import { loadEditorImageRegenerationQuota } from "../topic/imageEdits"
import { toHomePodcastEpisodes } from "./podcastEpisodeHomeOrder"
import {
	type AccessiblePodcastEpisode,
	loadAccessiblePodcastEpisode,
	loadPodcastEpisodeListenRows,
	loadPublishedPodcastEpisode,
	loadPublishedPodcastEpisodeRows,
	type PodcastEpisodePageRef,
	type PodcastEpisodeRow,
	type PodcastEpisodeTopic,
	type TopicRow,
} from "./podcastEpisodeRows"
import {
	loadPodcastEpisode,
	loadPodcastEpisodeSummaries,
	loadPodcastEpisodes,
	loadTopicPodcastEpisodeVideos,
	type TopicPodcastEpisodeVideos,
	toPodcastEpisode,
} from "./podcastEpisodeShapes"
import { loadRelatedPodcastEpisodeRows, loadTopicPodcastEpisodeRows } from "./relatedPodcastEpisodes"
import { toHomeTopicPodcastEpisodeVideos } from "./topicPodcastEpisodeVideoHomeOrder"
import { loadTopicPodcastEpisodeVideoImageEdit } from "./topicPodcastEpisodeVideos"

// the topic page's podcast, its latest podcast episode with chapters, and each scan's published podcast episode
// by the scan's id
type TopicPodcastFields = {
	podcast: TopicPodcast | null
	latestPodcastEpisode: PodcastEpisode | null
	podcastEpisodeByScanId: Map<string, TopicScan["podcastEpisode"]>
}

// the topic, the user, the season to load podcast episodes for, and whether to keep only the ones with a ready film
type LoadSeasonPodcastEpisodesOptions = {
	topic: TopicRow
	userId: string | null
	season: number
	hasVideo?: "true" | "false"
}

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

	// the ready and the rendering films of the published podcast episodes, read once for every list below, and the
	// newest published podcast episode with a ready one, which Topic Cinema shows
	const topicPodcastEpisodeVideos = await loadTopicPodcastEpisodeVideos(
		publishedPodcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id),
	)
	const latestFilmRow = publishedPodcastEpisodeRows.find((podcastEpisodeRow) =>
		topicPodcastEpisodeVideos.readyTopicPodcastEpisodeVideos.has(podcastEpisodeRow.id),
	)

	// the latest podcast episode and the latest film's podcast episode, listed once if they are the same one
	const playerPodcastEpisodeRows = [...new Set([latestPublishedPodcastEpisodeRow, latestFilmRow])].flatMap(
		(podcastEpisodeRow) => podcastEpisodeRow ?? [],
	)

	// whether the newest podcast episode is recording or failed to record, and the published podcast episodes that a
	// scan recorded
	const isNewestPodcastEpisodeUnpublished =
		newestPodcastEpisodeRow?.status === "recording" || newestPodcastEpisodeRow?.status === "failed"
	const scanPodcastEpisodeRows = publishedPodcastEpisodeRows.filter((podcastEpisodeRow) => podcastEpisodeRow.scanId)

	// the unpublished newest podcast episode if the user may see it, the player's podcast episodes with their chapters,
	// the latest season's podcast episodes, and each scan's podcast episode summary
	// ponytail: the whole latest season goes with every topic page. page the list if a season reaches the hundreds
	const [latestSeason] = seasons
	const [
		accessibleUnpublishedPodcastEpisode,
		playerPodcastEpisodes,
		latestSeasonPodcastEpisodes,
		scanPodcastEpisodeSummaries,
	] = await Promise.all([
		newestPodcastEpisodeRow && isNewestPodcastEpisodeUnpublished
			? loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: newestPodcastEpisodeRow.id })
			: null,
		loadPodcastEpisodes({
			podcastEpisodeRowTopics: playerPodcastEpisodeRows.map((podcastEpisodeRow) => ({ podcastEpisodeRow, topic })),
			userId,
			topicPodcastEpisodeVideos,
		}),
		latestSeason === undefined
			? { podcastEpisodes: [] }
			: toSeasonPodcastEpisodes({
					topic,
					publishedPodcastEpisodeRows,
					userId,
					season: latestSeason,
					topicPodcastEpisodeVideos,
				}),
		loadPodcastEpisodeSummaries(
			scanPodcastEpisodeRows.map((podcastEpisodeRow) => ({ podcastEpisodeRow, topic })),
			topicPodcastEpisodeVideos,
		),
	])

	// the latest podcast episode, and Topic Cinema's latest film, or null if no podcast episode has a ready film
	const playerPodcastEpisodeById = new Map(
		playerPodcastEpisodes.map((podcastEpisode) => [podcastEpisode.id, podcastEpisode]),
	)
	const latestPodcastEpisode = playerPodcastEpisodeById.get(latestPublishedPodcastEpisodeRow?.id ?? "") ?? null
	const latestFilmPodcastEpisode = playerPodcastEpisodeById.get(latestFilmRow?.id ?? "")
	const topicPodcastEpisodeVideoSection = latestFilmPodcastEpisode ? { podcastEpisode: latestFilmPodcastEpisode } : null

	// the podcast with its episodes and feed, the latest podcast episode, and each scan's podcast episode
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
			// Topic Cinema, and a public topic's film feed url once the topic has a film
			topicPodcastEpisodeVideoSection,
			publicVideoFeedUrl:
				topic.visibility === "public" && topicPodcastEpisodeVideoSection ? toPodcastVideoFeedPath(topic.id) : null,
		},
		latestPodcastEpisode,
		podcastEpisodeByScanId: toPodcastEpisodeByScanId(scanPodcastEpisodeRows, scanPodcastEpisodeSummaries),
	}
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

	// the Coffee Break films list keeps the podcast episodes with a ready film
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
	topicPodcastEpisodeVideos?: TopicPodcastEpisodeVideos
}

// a season's podcast episodes, with the user's progress through each
async function toSeasonPodcastEpisodes({
	topic,
	publishedPodcastEpisodeRows,
	userId,
	season,
	topicPodcastEpisodeVideos: loadedTopicPodcastEpisodeVideos,
}: ToSeasonPodcastEpisodesOptions): Promise<SeasonPodcastEpisodes> {
	// keep the season's podcast episodes, and attach the user's progress and the film to each
	const seasonPodcastEpisodeRows = publishedPodcastEpisodeRows.filter(
		(podcastEpisodeRow) => podcastEpisodeRow.season === season,
	)
	const seasonPodcastEpisodeIds = seasonPodcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id)
	const [podcastEpisodeListenRows, { readyTopicPodcastEpisodeVideos, videoRenderingPodcastEpisodeIds }] =
		await Promise.all([
			loadPodcastEpisodeListenRows(userId, seasonPodcastEpisodeIds),
			loadedTopicPodcastEpisodeVideos ?? loadTopicPodcastEpisodeVideos(seasonPodcastEpisodeIds),
		])
	return {
		podcastEpisodes: seasonPodcastEpisodeRows.map((podcastEpisodeRow) =>
			toPodcastEpisode({
				podcastEpisodeRow,
				topic,
				podcastEpisodeListenRow: podcastEpisodeListenRows.find(
					(podcastEpisodeListenRow) => podcastEpisodeListenRow.podcastEpisodeId === podcastEpisodeRow.id,
				),
				readyTopicPodcastEpisodeVideo: readyTopicPodcastEpisodeVideos.get(podcastEpisodeRow.id),
				isVideoRendering: videoRenderingPodcastEpisodeIds.has(podcastEpisodeRow.id),
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
	// the published podcast episode that the page ref names, with the user's access read started beside it. the access
	// check below shares that read through the request memo
	const [publishedPodcastEpisode] = await Promise.all([
		loadPublishedPodcastEpisode(podcastEpisodePageRef),
		userId ? loadUserAccess(userId) : null,
	])

	// the podcast episode, if the user may listen to it
	const accessiblePodcastEpisode = publishedPodcastEpisode
		? await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: publishedPodcastEpisode.podcastEpisodeRow.id })
		: null
	if (!accessiblePodcastEpisode) {
		return null
	}

	// the related podcast episodes that the user may listen to, each with its description and with its chapter count
	// for its play button. the page's slowest read, which loads beside everything else the page shows
	const { podcastEpisodeRow, topic } = accessiblePodcastEpisode
	const [relatedPodcastEpisodes, podcastEpisodePageFields] = await Promise.all([
		loadRelatedPodcastEpisodeRows({ podcastEpisodeId: podcastEpisodeRow.id, topic, userId }).then(
			loadPodcastEpisodeSummaries,
		),
		loadPodcastEpisodePageFields(accessiblePodcastEpisode, userId),
	])
	return { ...podcastEpisodePageFields, relatedPodcastEpisodes }
}

// everything a podcast episode's page shows but its related podcast episodes
async function loadPodcastEpisodePageFields(
	{ podcastEpisodeRow, topic, subscriberActivatedAt }: AccessiblePodcastEpisode,
	userId: string | null,
): Promise<Omit<PodcastEpisodePageResponse, "relatedPodcastEpisodes">> {
	// load the podcast episode, its script and home order, the findings that the user may see, whether the user may rate the findings
	// or remove the episode, the topic's byline, the owning team, the holding teams that the user is on, and the topic's
	// other podcast episodes
	const podcastEpisodeId = podcastEpisodeRow.id
	const [
		[podcastEpisodeScriptRow],
		podcastEpisode,
		{ topicFindings, isAdmin },
		canRate,
		canRemovePodcastEpisode,
		canEditPodcastEpisode,
		owner,
		{ teamLink, team, roomTeams },
		topicPodcastEpisodes,
		commentThread,
	] = await Promise.all([
		db
			.select({
				script: podcastEpisodes.script,
				homeOrder: podcastEpisodes.homeOrder,
				imageOrigin: podcastEpisodes.imageOrigin,
				imagePrompt: podcastEpisodes.imagePrompt,
			})
			.from(podcastEpisodes)
			.where(eq(podcastEpisodes.id, podcastEpisodeId)),
		loadPodcastEpisode({ podcastEpisodeRow, topic, userId }),
		loadTopicAccessAndFindings({ topic, userId, isReactionReadSkipped: true }),
		canRateTopic(userId, topic),
		isAllowed(userId, "podcastEpisode:remove", topic),
		isAllowed(userId, "topic:edit", topic),
		// the owner and the team that the topic's byline credits
		loadTopicOwner(topic.ownerId),
		toTeamFields(topic.id, topic.teamId, userId),
		// the topic's other podcast episodes that the user may listen to, each with its description and with its chapter
		// count for its play button
		loadTopicPodcastEpisodeRows({ podcastEpisodeId, topic, subscriberActivatedAt }).then(loadPodcastEpisodeSummaries),
		// the first page of the podcast episode's comment thread
		loadPageCommentThread({ userId, topic, target: { kind: "podcastEpisode", id: podcastEpisodeId } }),
	])

	// keep the findings that the chapters narrate
	const chapterFindingIds = new Set(
		podcastEpisode.chapters.map((podcastEpisodeChapter) => podcastEpisodeChapter.findingId),
	)
	const chapterTopicFindings = topicFindings.filter((topicFinding) => chapterFindingIds.has(topicFinding.findingId))

	// read the chapters' findings' reactions and the page's own, the editor's regenerations this month and the film's
	// image fields, and the admin's home lists, and fill the chapters' favicons, all together
	const [
		reactions,
		imageRegenerationQuota,
		topicPodcastEpisodeVideoImageEdit,
		homePodcastEpisodes,
		homeTopicPodcastEpisodeVideos,
	] = await Promise.all([
		attachReactionSummaries({
			topicFindings: chapterTopicFindings,
			userId,
			pageSocialTarget: { kind: "podcastEpisode", id: podcastEpisodeId },
		}),
		canEditPodcastEpisode && userId ? loadEditorImageRegenerationQuota(userId) : null,
		loadTopicPodcastEpisodeVideoImageEdit({ podcastEpisodeId, canEditPodcastEpisode }),
		toHomePodcastEpisodes(podcastEpisodeScriptRow?.homeOrder ?? null, isAdmin),
		toHomeTopicPodcastEpisodeVideos(podcastEpisodeId, isAdmin),
		attachPodcastEpisodeChapterFaviconPaths(podcastEpisode.chapters),
	])
	const { id, name, prompt, visibility } = topic
	return {
		podcastEpisode,
		topic: { id, name, prompt, visibility, owner, teamLink, team, roomTeams, isTopicOwner: topic.ownerId === userId },
		topicFindings: chapterTopicFindings,
		canRate,
		canRemovePodcastEpisode,
		canEditPodcastEpisode,
		podcastEpisodeImageOrigin: canEditPodcastEpisode ? (podcastEpisodeScriptRow?.imageOrigin ?? null) : null,
		podcastEpisodeImagePrompt: canEditPodcastEpisode ? (podcastEpisodeScriptRow?.imagePrompt ?? null) : null,
		imageRegenerationQuota,
		...topicPodcastEpisodeVideoImageEdit,
		...homePodcastEpisodes,
		...homeTopicPodcastEpisodeVideos,
		transcript: podcastEpisodeScriptRow?.script ? toTranscriptBlocks(podcastEpisodeScriptRow.script) : [],
		topicPodcastEpisodes,
		reactions,
		commentThread,
	}
}
