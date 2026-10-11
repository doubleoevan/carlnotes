// the podcast shapes: a topic page's podcast, each feed topic's latest podcast episode, a season's podcast episodes,
// a podcast episode page, and a podcast episode as the player shows it, each limited to what the user may listen to
import type {
	PodcastEpisode,
	PodcastEpisodePageResponse,
	SeasonPodcastEpisodes,
	TopicPodcast,
	TopicScan,
} from "@shared/contracts"
import { isPodcastEpisodeRecordingConfigured, toPodcastCoverPath } from "@shared/podcastEpisodes"
import { toPodcastEpisodePath, toPodcastFeedPath } from "@shared/seo"
import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodeChapters, podcastEpisodes } from "../../db/schema/podcast"
import { isAllowed } from "../authorization"
import { attachPodcastEpisodeChapterFaviconPaths } from "../favicons"
import { toTranscriptBlocks } from "../share/podcastFeed"
import { loadTopicAccessAndFindings } from "../topic/accessibleFindings"
import { loadTopicOwner, topicSubscriptionStartDates, toTeamFields } from "../topic/helpers"
import { canRateTopic } from "../topic/permissions"
import {
	isAfterSubscriberActivation,
	loadAccessiblePodcastEpisode,
	loadPodcastEpisodeListenRows,
	loadPublishedPodcastEpisode,
	loadPublishedPodcastEpisodeRows,
	type PodcastEpisodeListenRow,
	type PodcastEpisodePageRef,
	type PodcastEpisodeRow,
	type PodcastEpisodeTopic,
	podcastEpisodeColumns,
	type TopicRow,
} from "./podcastEpisodeRows"

// the topic fields that the latest podcast episode loader reads: the podcast episode's topic and its access check
type LatestPodcastEpisodeTopic = Pick<TopicRow, "id" | "name" | "ownerId" | "visibility">

// the row, topic, chapter rows if any, and listen row that a podcast episode is built from
type ToPodcastEpisodeOptions = {
	podcastEpisodeRow: PodcastEpisodeRow
	topic: PodcastEpisodeTopic
	podcastEpisodeChapterRows?: (typeof podcastEpisodeChapters.$inferSelect)[]
	podcastEpisodeListenRow?: PodcastEpisodeListenRow
}

// the podcast episode row, its topic, and the user, null for a visitor
type LoadPodcastEpisodeOptions = {
	podcastEpisodeRow: PodcastEpisodeRow
	topic: PodcastEpisodeTopic
	userId: string | null
}

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

	// each scan's published podcast episode, by the scan's id
	const podcastEpisodeByScanId = new Map<string, TopicScan["podcastEpisode"]>()
	for (const { id, scanId, season, episodeNumber } of publishedPodcastEpisodeRows) {
		if (scanId && season !== null && episodeNumber !== null) {
			podcastEpisodeByScanId.set(scanId, { id, season, episodeNumber })
		}
	}

	// the latest podcast episode with its chapters, and the latest season's episodes
	// ponytail: the whole latest season goes with every topic page. page the list if a season reaches the hundreds
	const [latestSeason] = seasons
	const [latestPodcastEpisode, latestSeasonPodcastEpisodes] = await Promise.all([
		latestPublishedPodcastEpisodeRow
			? loadPodcastEpisode({ podcastEpisodeRow: latestPublishedPodcastEpisodeRow, topic, userId })
			: null,
		latestSeason === undefined
			? { podcastEpisodes: [] }
			: toSeasonPodcastEpisodes({ topic, publishedPodcastEpisodeRows, userId, season: latestSeason }),
	])
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
 * Loads each topic's latest published podcast episode that the user may listen to, with its chapters, by topic id.
 */
export async function loadLatestPodcastEpisodes(
	topicRows: LatestPodcastEpisodeTopic[],
	userId: string | null,
): Promise<Map<string, PodcastEpisode>> {
	if (!isPodcastEpisodeRecordingConfigured() || topicRows.length === 0) {
		return new Map()
	}

	// each topic's newest published podcast episode, and when the user's subscription to each gated topic activated
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [latestPodcastEpisodeRows, subscriberActivatedAtByTopicId] = await Promise.all([
		db
			.selectDistinctOn([podcastEpisodes.topicId], podcastEpisodeColumns)
			.from(podcastEpisodes)
			.where(and(inArray(podcastEpisodes.topicId, topicIds), eq(podcastEpisodes.status, "published")))
			.orderBy(podcastEpisodes.topicId, desc(podcastEpisodes.publishedAt)),
		topicSubscriptionStartDates(topicRows, userId),
	])

	// keep each newest podcast episode that the user may listen to, with its topic. an older episode never passes a gate
	// that the newest episode fails, and a topic with no gate has no activation time
	const topicById = new Map(topicRows.map((topicRow) => [topicRow.id, topicRow]))
	const listenablePodcastEpisodes = latestPodcastEpisodeRows.flatMap((podcastEpisodeRow) => {
		const topic = podcastEpisodeRow.topicId ? topicById.get(podcastEpisodeRow.topicId) : undefined
		const subscriberActivatedAt = topic ? subscriberActivatedAtByTopicId.get(topic.id) : null
		return topic && isAfterSubscriberActivation(podcastEpisodeRow.publishedAt, subscriberActivatedAt)
			? [{ podcastEpisodeRow, topic }]
			: []
	})

	// load each podcast episode's chapters and the user's progress, then key the episodes by topic id
	const latestPodcastEpisodes = await loadPodcastEpisodes(listenablePodcastEpisodes, userId)
	return new Map(latestPodcastEpisodes.map((podcastEpisode) => [podcastEpisode.topicId, podcastEpisode]))
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
	// or remove the episode, the topic's byline, the owning team, and the holding teams that the user is on
	const { podcastEpisodeRow, topic } = accessiblePodcastEpisode
	const [
		[podcastEpisodeScriptRow],
		podcastEpisode,
		{ topicFindings },
		canRate,
		canRemovePodcastEpisode,
		owner,
		{ teamLink, team, roomTeams },
	] = await Promise.all([
		db
			.select({ script: podcastEpisodes.script })
			.from(podcastEpisodes)
			.where(eq(podcastEpisodes.id, podcastEpisodeRow.id)),
		loadPodcastEpisode({ podcastEpisodeRow, topic, userId }),
		loadTopicAccessAndFindings({ topic, userId }),
		canRateTopic(userId, topic),
		isAllowed(userId, "podcastEpisode:remove", topic),
		// the owner and the team that the topic's byline credits
		loadTopicOwner(topic.ownerId),
		toTeamFields(topic.id, topic.teamId, userId),
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
	}
}

/**
 * Loads a podcast episode as the player shows it, with its chapters and the user's progress.
 */
export async function loadPodcastEpisode({
	podcastEpisodeRow,
	topic,
	userId,
}: LoadPodcastEpisodeOptions): Promise<PodcastEpisode> {
	// a list with a single podcast episode returns that podcast episode
	const [podcastEpisode] = await loadPodcastEpisodes([{ podcastEpisodeRow, topic }], userId)
	return podcastEpisode as PodcastEpisode
}

// podcast episodes in the shape that the player shows, each with its chapters and the user's progress, in the order given
async function loadPodcastEpisodes(
	podcastEpisodeTopics: { podcastEpisodeRow: PodcastEpisodeRow; topic: PodcastEpisodeTopic }[],
	userId: string | null,
): Promise<PodcastEpisode[]> {
	const podcastEpisodeIds = podcastEpisodeTopics.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// every podcast episode's chapters in their order, and the user's progress through each episode
	const [podcastEpisodeChapterRows, podcastEpisodeListenRows] = await Promise.all([
		db
			.select()
			.from(podcastEpisodeChapters)
			.where(inArray(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeIds))
			.orderBy(podcastEpisodeChapters.position),
		loadPodcastEpisodeListenRows(userId, podcastEpisodeIds),
	])

	// build each podcast episode from its own chapters and listen row
	const chapterRowsByPodcastEpisodeId = Map.groupBy(
		podcastEpisodeChapterRows,
		(chapterRow) => chapterRow.podcastEpisodeId,
	)
	const listenRowByPodcastEpisodeId = new Map(
		podcastEpisodeListenRows.map((listenRow) => [listenRow.podcastEpisodeId, listenRow]),
	)
	return podcastEpisodeTopics.map(({ podcastEpisodeRow, topic }) =>
		toPodcastEpisode({
			podcastEpisodeRow,
			topic,
			podcastEpisodeChapterRows: chapterRowsByPodcastEpisodeId.get(podcastEpisodeRow.id),
			podcastEpisodeListenRow: listenRowByPodcastEpisodeId.get(podcastEpisodeRow.id),
		}),
	)
}

// a podcast episode as the player shows it
function toPodcastEpisode({
	podcastEpisodeRow,
	topic,
	podcastEpisodeChapterRows = [],
	podcastEpisodeListenRow,
}: ToPodcastEpisodeOptions): PodcastEpisode {
	// map a removed status to failed. the loaders never return a removed podcast episode
	const status = podcastEpisodeRow.status === "removed" ? "failed" : podcastEpisodeRow.status

	// a published podcast episode has its own page
	const pagePath = status === "published" ? toPodcastEpisodePath(topic, podcastEpisodeRow) : null

	// a podcast episode has a cover once it has a title
	const podcastCover = podcastEpisodeRow.title
		? { kind: "episode" as const, id: podcastEpisodeRow.id, title: podcastEpisodeRow.title }
		: null
	return {
		id: podcastEpisodeRow.id,
		topicId: podcastEpisodeRow.topicId ?? "",
		topicVisibility: topic.visibility,
		status,
		title: podcastEpisodeRow.title,
		description: podcastEpisodeRow.description,
		// assigned on publish
		season: podcastEpisodeRow.season,
		episodeNumber: podcastEpisodeRow.episodeNumber,
		durationSeconds: podcastEpisodeRow.durationSeconds,
		publishedAt: podcastEpisodeRow.publishedAt?.toISOString() ?? null,
		pagePath,
		// the audio and the cover
		audioUrl: status === "published" ? `/api/episodes/${podcastEpisodeRow.id}/audio.mp3` : null,
		coverUrl: podcastCover ? toPodcastCoverPath(podcastCover, 3000) : null,
		smallCoverUrl: podcastCover ? toPodcastCoverPath(podcastCover, 600) : null,
		chapters: podcastEpisodeChapterRows.map(
			({ position, title, findingId, sourceUrl, rating, startSeconds, endSeconds }) => ({
				position,
				title,
				findingId,
				sourceUrl,
				rating,
				faviconPath: null,
				startSeconds,
				endSeconds,
			}),
		),
		// the user's progress
		progressSeconds: podcastEpisodeListenRow?.progressSeconds ?? 0,
		isCompleted: Boolean(podcastEpisodeListenRow?.completedAt),
	}
}
