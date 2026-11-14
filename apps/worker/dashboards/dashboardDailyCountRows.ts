// the daily count rows one Dashboard counts: the views of a subject's topics, findings, or Topic Posts, or the plays of
// its published podcast episodes, over the window, each with its item's title, path, and whether anyone may see it
import type { DashboardPlayFormat, DashboardSubject, Place, ViewItemKind } from "@carlnotes/contracts/dashboards"
import { type PodcastEpisodeFormat, podcastEpisodeFormats } from "@carlnotes/contracts/podcast"
import {
	toFindingPath,
	toPodcastEpisodePath,
	toTopicPath,
	toTopicPlayerPath,
	toTopicPostPath,
} from "@carlnotes/contracts/seo"
import { toCutText, toOneLineText } from "@carlnotes/contracts/text"
import { db } from "@carlnotes/db"
import { type PlaceColumns, toDailyCountPlace } from "@carlnotes/db/dailyCountBuffer"
import { toConvertedPersonalSourcesFilter } from "@carlnotes/db/personalSourcesAuthority"
import { dailyPlayCounts, dailyViewCounts } from "@carlnotes/db/schema/dailyCounts"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { and, between, eq, inArray, isNotNull, ne, or, type SQL } from "drizzle-orm"

// the longest title a chart shows
const TITLE_MAX_LENGTH = 120

// one daily count row with its item: the item's id, plain-text title, path, and whether it is public, then the row's
// day, place, count, and sketch. a play row also names its format
export type DashboardDailyCountRow = {
	itemId: string
	title: string
	path: string
	isPublic: boolean
	// the row's own day, place, counts, and format
	day: string
	placeKey: string
	place: Place | null
	count: number
	sketch: Uint8Array | null
	format: PodcastEpisodeFormat | null
}

// the subject, and the window's first and last completed days
type LoadDailyCountRowsOptions = { subject: DashboardSubject; firstDay: string; lastDay: string }

/**
 * Returns the subject's topics as a filter. A person's Dashboard reads every topic they own, on a team or not. A team's
 * Dashboard reads the team's topics and leaves out a private topic whose legacy Personal sources text is not converted
 * yet, as the topic view rule does for members.
 */
export function toSubjectTopicFilter(subject: DashboardSubject): SQL | undefined {
	return subject.dashboardKind === "teamDashboard"
		? and(
				eq(topics.teamId, subject.subjectId),
				or(ne(topics.visibility, "private"), toConvertedPersonalSourcesFilter()),
			)
		: eq(topics.ownerId, subject.subjectId)
}

/**
 * Loads the views of one kind of the subject's items over the window.
 */
export async function loadDailyViewCountRows(
	itemKind: ViewItemKind,
	{ subject, firstDay, lastDay }: LoadDailyCountRowsOptions,
): Promise<DashboardDailyCountRow[]> {
	const viewFilter = and(
		eq(dailyViewCounts.itemKind, itemKind),
		between(dailyViewCounts.day, firstDay, lastDay),
		toSubjectTopicFilter(subject),
	)
	// the row's columns and its topic's, with the item's own title and path read per kind
	const rowColumns = {
		itemId: dailyViewCounts.itemId,
		day: dailyViewCounts.day,
		placeKey: dailyViewCounts.placeKey,
		country: dailyViewCounts.country,
		region: dailyViewCounts.region,
		city: dailyViewCounts.city,
		postalCode: dailyViewCounts.postalCode,
		metroCode: dailyViewCounts.metroCode,
		latitude: dailyViewCounts.latitude,
		longitude: dailyViewCounts.longitude,
		count: dailyViewCounts.viewCount,
		sketch: dailyViewCounts.viewerSketch,
		topicId: topics.id,
		topicName: topics.name,
		visibility: topics.visibility,
	}

	// a topic's own views
	if (itemKind === "topic") {
		const topicRows = await db
			.select(rowColumns)
			.from(dailyViewCounts)
			.innerJoin(topics, eq(topics.id, dailyViewCounts.itemId))
			.where(viewFilter)

		// each row titled by its topic
		return topicRows.map((topicRow) => {
			const topic = { id: topicRow.topicId, name: topicRow.topicName }
			return toDashboardDailyCountRow({ readRow: topicRow, title: topicRow.topicName, path: toTopicPath(topic) })
		})
	}

	// a finding's views, titled by its resource
	if (itemKind === "finding") {
		const findingRows = await db
			.select({ ...rowColumns, title: resources.title })
			.from(dailyViewCounts)
			.innerJoin(findings, eq(findings.id, dailyViewCounts.itemId))
			.innerJoin(topics, eq(topics.id, findings.topicId))
			.innerJoin(resources, eq(resources.id, findings.resourceId))
			.where(viewFilter)

		// each row titled by its finding's resource
		return findingRows.map((findingRow) => {
			const topic = { id: findingRow.topicId, name: findingRow.topicName }
			return toDashboardDailyCountRow({
				readRow: findingRow,
				title: findingRow.title ?? "",
				path: toFindingPath(topic, findingRow.itemId),
			})
		})
	}

	// a published Topic Post's views
	const topicPostRows = await db
		.select({ ...rowColumns, title: topicPosts.title })
		.from(dailyViewCounts)
		.innerJoin(topicPosts, eq(topicPosts.id, dailyViewCounts.itemId))
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.where(and(viewFilter, isNotNull(topicPosts.publishedAt)))

	// each row titled by its Topic Post
	return topicPostRows.map((topicPostRow) => {
		const topic = { id: topicPostRow.topicId, name: topicPostRow.topicName }
		const path = toTopicPostPath(topic, { id: topicPostRow.itemId, title: topicPostRow.title })
		return toDashboardDailyCountRow({ readRow: topicPostRow, title: topicPostRow.title, path })
	})
}

/**
 * Loads the plays of the subject's published podcast episodes in the chosen format over the window.
 */
export async function loadDailyPlayCountRows(
	playFormat: DashboardPlayFormat,
	{ subject, firstDay, lastDay }: LoadDailyCountRowsOptions,
): Promise<DashboardDailyCountRow[]> {
	const formats = playFormat === "both" ? podcastEpisodeFormats : [playFormat]
	const playRows = await db
		.select({
			itemId: dailyPlayCounts.podcastEpisodeId,
			format: dailyPlayCounts.format,
			day: dailyPlayCounts.day,
			placeKey: dailyPlayCounts.placeKey,
			country: dailyPlayCounts.country,
			region: dailyPlayCounts.region,
			city: dailyPlayCounts.city,
			postalCode: dailyPlayCounts.postalCode,
			metroCode: dailyPlayCounts.metroCode,
			latitude: dailyPlayCounts.latitude,
			longitude: dailyPlayCounts.longitude,
			count: dailyPlayCounts.playCount,
			sketch: dailyPlayCounts.listenerSketch,
			title: podcastEpisodes.title,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
			topicId: topics.id,
			topicName: topics.name,
			visibility: topics.visibility,
		})
		.from(dailyPlayCounts)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, dailyPlayCounts.podcastEpisodeId))
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(
			and(
				inArray(dailyPlayCounts.format, [...formats]),
				between(dailyPlayCounts.day, firstDay, lastDay),
				eq(podcastEpisodes.status, "published"),
				toSubjectTopicFilter(subject),
			),
		)

	// each play row with its podcast episode's title and path
	return playRows.map((playRow) => {
		const topic = { id: playRow.topicId, name: playRow.topicName }

		// a numbered podcast episode has its own page, and any other opens its topic at the film or the podcast player
		const path =
			playRow.season !== null && playRow.episodeNumber !== null
				? toPodcastEpisodePath(topic, { season: playRow.season, episodeNumber: playRow.episodeNumber })
				: toTopicPlayerPath(topic, playRow.format)
		return {
			...toDashboardDailyCountRow({ readRow: playRow, title: playRow.title ?? "", path }),
			format: playRow.format,
		}
	})
}

// a view or play read row, with its item's visibility
type DashboardReadRow = PlaceColumns & {
	itemId: string
	day: string
	placeKey: string
	count: number
	sketch: Uint8Array | null
	visibility: string
}

// a read row, and its item's title and path
type ToDashboardDailyCountRowOptions = { readRow: DashboardReadRow; title: string; path: string }

// a read row as a daily count row with its item's title and path
function toDashboardDailyCountRow({ readRow, title, path }: ToDashboardDailyCountRowOptions): DashboardDailyCountRow {
	return {
		itemId: readRow.itemId,
		title: toCutText(toOneLineText(title), TITLE_MAX_LENGTH),
		path,
		isPublic: readRow.visibility === "public",
		day: readRow.day,
		placeKey: readRow.placeKey,
		place: toDailyCountPlace(readRow),
		count: readRow.count,
		sketch: readRow.sketch,
		format: null,
	}
}
