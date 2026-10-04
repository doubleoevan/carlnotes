// the reads for a topic page's podcast, a season's podcast episodes, one episode by its id, and a podcast episode page,
// each limited to what the user may listen to
import type {
	PodcastEpisode,
	PodcastEpisodePageResponse,
	SeasonPodcastEpisodes,
	TopicPodcast,
	TopicScan,
} from "@shared/contracts"
import { isPodcastEpisodeRenderingConfigured, toPodcastCoverPath } from "@shared/podcastEpisodes"
import { toPodcastEpisodePath, toPodcastFeedPath } from "@shared/seo"
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm"
import { db } from "../../db"
import { loadUserAccess } from "../../db/quotas"
import { podcastEpisodeChapters, podcastEpisodeListens, podcastEpisodes, scans, topics } from "../../db/schema"
import { isAllowed } from "../authorization"
import { attachPodcastEpisodeChapterFaviconPaths } from "../favicons"
import { toTranscriptBlocks } from "../share/podcastFeed"
import { loadTopicAccessAndFindings, loadTopicOwner, topicSubscriptionStartDate, toTeamFields } from "../topic/helpers"
import { canRateTopic } from "../topic/permissions"

// a podcast episode's columns, without its script
const podcastEpisodeColumns = {
	id: podcastEpisodes.id,
	topicId: podcastEpisodes.topicId,
	scanId: podcastEpisodes.scanId,
	status: podcastEpisodes.status,
	title: podcastEpisodes.title,
	description: podcastEpisodes.description,
	// assigned on publish
	season: podcastEpisodes.season,
	episodeNumber: podcastEpisodes.episodeNumber,
	audioKey: podcastEpisodes.audioKey,
	audioByteSize: podcastEpisodes.audioByteSize,
	durationSeconds: podcastEpisodes.durationSeconds,
	publishedAt: podcastEpisodes.publishedAt,
}

// a podcast episode row with the columns above, and a topic row
export type PodcastEpisodeRow = Pick<typeof podcastEpisodes.$inferSelect, keyof typeof podcastEpisodeColumns>
type TopicRow = typeof topics.$inferSelect

// a user's saved progress through one podcast episode, and when the user finished it
type PodcastEpisodeListenRow = Pick<
	typeof podcastEpisodeListens.$inferSelect,
	"podcastEpisodeId" | "progressSeconds" | "completedAt"
>

// the topic fields that a podcast episode's page path is built from
type PodcastEpisodeTopic = Pick<TopicRow, "id" | "name">

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

// a podcast episode's row and its topic, for a user who may listen to the episode
export type AccessiblePodcastEpisode = { podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow }

// the topic page's podcast, and each scan's published podcast episode by the scan's id
type TopicPodcastFields = {
	podcast: TopicPodcast | null
	podcastEpisodeByScanId: Map<string, TopicScan["podcastEpisode"]>
}

// the topic, the user, and the season to load podcast episodes for
type LoadSeasonPodcastEpisodesOptions = { topic: TopicRow; userId: string | null; season: number }

/**
 * Loads the topic page's podcast, or a null podcast if episode rendering is not configured.
 */
export async function loadTopicPodcast(topic: TopicRow, userId: string | null): Promise<TopicPodcastFields> {
	if (!isPodcastEpisodeRenderingConfigured()) {
		return { podcast: null, podcastEpisodeByScanId: new Map() }
	}

	// load the published podcast episodes that the user may listen to, newest first, and the newest episode that was
	// not removed. check whether the owner's plan renders another episode and whether the user may remove an episode
	const [publishedPodcastEpisodeRows, [newestPodcastEpisodeRow], canRenderPodcastEpisode, canRemovePodcastEpisodes] =
		await Promise.all([
			loadPublishedPodcastEpisodeRows(topic, userId),
			db
				.select({ id: podcastEpisodes.id, status: podcastEpisodes.status })
				.from(podcastEpisodes)
				.where(and(eq(podcastEpisodes.topicId, topic.id), ne(podcastEpisodes.status, "removed")))
				.orderBy(desc(podcastEpisodes.createdAt))
				.limit(1),
			isAllowed(topic.ownerId, "podcastEpisode:render", topic),
			isAllowed(userId, "podcastEpisode:remove", topic),
		])
	const [latestPublishedPodcastEpisodeRow] = publishedPodcastEpisodeRows
	const seasons = [
		...new Set(publishedPodcastEpisodeRows.flatMap((podcastEpisodeRow) => podcastEpisodeRow.season ?? [])),
	]

	// the newest podcast episode, if it is rendering or failed to render and the user may see it
	const isNewestPodcastEpisodeUnpublished =
		newestPodcastEpisodeRow?.status === "rendering" || newestPodcastEpisodeRow?.status === "failed"
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
			canRenderPodcastEpisode,
			canRemovePodcastEpisodes,
			latestPodcastEpisode,
			unpublishedPodcastEpisode: accessibleUnpublishedPodcastEpisode
				? toPodcastEpisode({ podcastEpisodeRow: accessibleUnpublishedPodcastEpisode.podcastEpisodeRow, topic })
				: null,
			seasons,
			latestSeasonPodcastEpisodes,
			// a public topic's podcast feed url, once the topic has a published podcast episode
			publicFeedUrl:
				topic.visibility === "public" && latestPublishedPodcastEpisodeRow ? toPodcastFeedPath(topic.id) : null,
		},
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

// the user, null for a visitor, and the podcast episode to load
type LoadAccessiblePodcastEpisodeOptions = { userId: string | null; podcastEpisodeId: string }

/**
 * Loads a podcast episode's row and its topic if the user may listen to the episode, or null.
 */
export async function loadAccessiblePodcastEpisode({
	userId,
	podcastEpisodeId,
}: LoadAccessiblePodcastEpisodeOptions): Promise<AccessiblePodcastEpisode | null> {
	if (!isPodcastEpisodeRenderingConfigured()) {
		return null
	}

	// the podcast episode with its topic and when its scan started.
	// an episode whose topic was deleted has no topic to join
	const [podcastEpisodeTopicRow] = await db
		.select({ podcastEpisodeRow: podcastEpisodeColumns, topic: topics, scanStartedAt: scans.startedAt })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.leftJoin(scans, eq(podcastEpisodes.scanId, scans.id))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))

	// return null for a removed podcast episode or an episode on a topic that the user cannot see
	const isPodcastEpisodeRemoved = podcastEpisodeTopicRow?.podcastEpisodeRow.status === "removed"
	if (
		!podcastEpisodeTopicRow ||
		isPodcastEpisodeRemoved ||
		!(await isAllowed(userId, "topic:view", podcastEpisodeTopicRow.topic))
	) {
		return null
	}

	// return the podcast episode if no subscription activation gate applies to the user
	const subscriberActivatedAt = await loadSubscriberActivatedAt(podcastEpisodeTopicRow.topic, userId)
	if (subscriberActivatedAt === undefined) {
		return podcastEpisodeTopicRow
	}

	// compare the activation with the podcast episode's publish time, or with its scan's start if it has not published
	const publishedOrScanStartedAt =
		podcastEpisodeTopicRow.podcastEpisodeRow.publishedAt ?? podcastEpisodeTopicRow.scanStartedAt
	const isPodcastEpisodeAfterActivation =
		subscriberActivatedAt !== null &&
		publishedOrScanStartedAt !== null &&
		publishedOrScanStartedAt > subscriberActivatedAt
	return isPodcastEpisodeAfterActivation ? podcastEpisodeTopicRow : null
}

// the topic, the season, and the episode number within the season that name a podcast episode page
type PodcastEpisodePageRef = { topicId: string; season: number; episodeNumber: number }

/**
 * Loads a published podcast episode of a public topic by its season and episode number, with its topic, or null.
 */
export async function loadPublicPodcastEpisode(
	podcastEpisodePageRef: PodcastEpisodePageRef,
): Promise<{ podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow } | null> {
	const publishedPodcastEpisode = await loadPublishedPodcastEpisode(podcastEpisodePageRef)
	return publishedPodcastEpisode?.topic.visibility === "public" ? publishedPodcastEpisode : null
}

// the published podcast episode at a season and episode number, with its topic. the topic may have any visibility
async function loadPublishedPodcastEpisode({
	topicId,
	season,
	episodeNumber,
}: PodcastEpisodePageRef): Promise<{ podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow } | null> {
	// the published podcast episode of the topic at the season and episode number
	const isPodcastEpisodeAtPageRef = and(
		eq(podcastEpisodes.topicId, topicId),
		eq(podcastEpisodes.season, season),
		eq(podcastEpisodes.episodeNumber, episodeNumber),
	)
	const [publishedPodcastEpisode] = await db
		.select({ podcastEpisodeRow: podcastEpisodeColumns, topic: topics })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(isPodcastEpisodeAtPageRef, eq(podcastEpisodes.status, "published")))
	return isPodcastEpisodeRenderingConfigured() && publishedPodcastEpisode ? publishedPodcastEpisode : null
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

	// load the podcast episode's script, the episode, the topic's findings that the user may see,
	// whether the user may rate the findings, and the topic's byline
	const { podcastEpisodeRow, topic } = accessiblePodcastEpisode
	const [[podcastEpisodeScriptRow], podcastEpisode, { topicFindings }, canRate, owner, { teamLink }] =
		await Promise.all([
			db
				.select({ script: podcastEpisodes.script })
				.from(podcastEpisodes)
				.where(eq(podcastEpisodes.id, podcastEpisodeRow.id)),
			loadPodcastEpisode({ podcastEpisodeRow, topic, userId }),
			loadTopicAccessAndFindings({ topic, userId }),
			canRateTopic(userId, topic),
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
		topic: { id, name, prompt, visibility, owner, teamLink },
		topicFindings: chapterTopicFindings,
		canRate,
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
	// the podcast episode's chapters in their order, and the user's progress
	const [podcastEpisodeChapterRows, [podcastEpisodeListenRow]] = await Promise.all([
		db
			.select()
			.from(podcastEpisodeChapters)
			.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeRow.id))
			.orderBy(podcastEpisodeChapters.position),
		loadPodcastEpisodeListenRows(userId, [podcastEpisodeRow.id]),
	])
	return toPodcastEpisode({ podcastEpisodeRow, topic, podcastEpisodeChapterRows, podcastEpisodeListenRow })
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

/**
 * Loads a topic's published podcast episodes that the user may listen to, newest first.
 */
export async function loadPublishedPodcastEpisodeRows(
	topic: TopicRow,
	userId: string | null,
): Promise<PodcastEpisodeRow[]> {
	// return no podcast episodes if episode rendering is not configured,
	// or if the user has no active subscription to an invite topic
	const subscriberActivatedAt = isPodcastEpisodeRenderingConfigured()
		? await loadSubscriberActivatedAt(topic, userId)
		: null
	if (subscriberActivatedAt === null) {
		return []
	}

	// the activation gate keeps only the podcast episodes published after the user's subscription activated
	// ponytail: reads every published episode of the topic.
	// page the read in sql if a topic's episodes reach the thousands
	const isPublishedPodcastEpisode = and(eq(podcastEpisodes.topicId, topic.id), eq(podcastEpisodes.status, "published"))
	return db
		.select(podcastEpisodeColumns)
		.from(podcastEpisodes)
		.where(
			subscriberActivatedAt
				? and(isPublishedPodcastEpisode, gt(podcastEpisodes.publishedAt, subscriberActivatedAt))
				: isPublishedPodcastEpisode,
		)
		.orderBy(desc(podcastEpisodes.publishedAt))
}

// when the user's subscription to an invite topic activated, null if the user has no active subscription,
// or undefined if no activation gate applies to the user
async function loadSubscriberActivatedAt(topic: TopicRow, userId: string | null): Promise<Date | null | undefined> {
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }
	return topicSubscriptionStartDate(topic, userId, isAdmin)
}

// the user's progress through the given podcast episodes. a visitor has none
async function loadPodcastEpisodeListenRows(
	userId: string | null,
	podcastEpisodeIds: string[],
): Promise<PodcastEpisodeListenRow[]> {
	if (!userId || podcastEpisodeIds.length === 0) {
		return []
	}
	return db
		.select({
			podcastEpisodeId: podcastEpisodeListens.podcastEpisodeId,
			progressSeconds: podcastEpisodeListens.progressSeconds,
			completedAt: podcastEpisodeListens.completedAt,
		})
		.from(podcastEpisodeListens)
		.where(
			and(eq(podcastEpisodeListens.userId, userId), inArray(podcastEpisodeListens.podcastEpisodeId, podcastEpisodeIds)),
		)
}
