// the news read: one numbered page of a person's News Events inside a window, the own group first, then their Teams'
// Topics, then the Topics they follow

import {
	NEWS_PAGE_SIZE,
	NEWS_WINDOW_MILLISECONDS,
	type NewsEvent,
	type NewsResponse,
	type NewsWindow,
	newsWindows,
} from "@carlnotes/contracts/news"
import { toCommentPath, toSocialTargetPath, toTopicPostPath } from "@carlnotes/contracts/seo"
import { toCommentFirstLine } from "@carlnotes/contracts/socialText"
import { DAY_MS } from "@carlnotes/contracts/time"
import {
	toPodcastEpisodeImageUrls,
	toTopicImageUrlsOrNull,
	toTopicPostImageUrls,
} from "@carlnotes/contracts/topicImages"
import { z } from "zod"
import { parseJsonCursor, toJsonCursor } from "../cursors"
import { loadNewsEventRows, type NewsEventRow } from "./newsEventRows"
import { loadNewsPodcastEpisodes } from "./newsPodcastEpisodes"
import { loadNewsTopicIds, type NewsGroup, newsGroups } from "./newsTopics"

// a window as its first read fixed it: the window, the time that read happened at, and each group's row count. a later
// page passes it back, so every page of the window reads the same rows. a time later than a day from now is no
// cursor, which keeps the time inside the dates the database stores
export const newsCursor = z.object({
	window: z.enum(newsWindows),
	until: z
		.number()
		.int()
		.positive()
		.refine((until) => until <= Date.now() + DAY_MS),
	groupTotals: z.tuple([
		z.number().int().nonnegative(),
		z.number().int().nonnegative(),
		z.number().int().nonnegative(),
	]),
})

type NewsCursor = z.infer<typeof newsCursor>

// whose news it is, who reads it, the window, the page, and the cursor an earlier page of the window returned
type ReadNewsOptions = {
	profileUserId: string
	userId: string | null
	window: NewsWindow
	page: number
	cursor?: string
	// how many rows a page holds, which every page of one window keeps
	pageSize?: number
}

/**
 * Reads one numbered page of a person's news, or returns null if the cursor is not one a page of this window returned.
 * The window ends at its first read, so a later page never repeats or skips a row that arrived in between.
 */
export async function readNews({
	profileUserId,
	userId,
	window,
	page,
	cursor,
	pageSize = NEWS_PAGE_SIZE,
}: ReadNewsOptions): Promise<NewsResponse | null> {
	// a cursor continues its own window
	const windowCursor = cursor ? parseJsonCursor(newsCursor, cursor) : null
	if (cursor && windowCursor?.window !== window) {
		return null
	}

	// the window's two ends, and the groups' Topics as the reader may open them
	const until = new Date(windowCursor?.until ?? Date.now())
	const since = new Date(until.getTime() - NEWS_WINDOW_MILLISECONDS[window])
	const topicIds = await loadNewsTopicIds({ profileUserId, isOwnNews: userId === profileUserId })
	const groupRead = { topicIds, profileUserId, readerUserId: userId, since, until }

	// one group's rows from an offset
	const loadGroupRows = (group: NewsGroup, offset: number, limit: number): Promise<NewsEventRow[]> =>
		loadNewsEventRows({ ...groupRead, group, offset, limit })

	// a read with no cursor reads every group from its start, which counts each group
	const firstNewsPage = windowCursor
		? null
		: toFirstNewsPage(await Promise.all(newsGroups.map((group) => loadGroupRows(group, 0, pageSize))), pageSize)
	const groupTotals = windowCursor?.groupTotals ?? firstNewsPage?.groupTotals ?? [0, 0, 0]

	// the first page is those first rows, and any other page reads from its offset
	const newsEventRows =
		firstNewsPage && page === 1
			? firstNewsPage.newsEventRows
			: await loadNewsEventRowsFrom({ offset: (page - 1) * pageSize, groupTotals, pageSize }, loadGroupRows)
	return {
		newsEvents: newsEventRows.map(toNewsEvent),
		podcastEpisodes: await loadNewsPodcastEpisodes(newsEventRows, userId),
		total: groupTotals.reduce((groupTotalSum, groupTotal) => groupTotalSum + groupTotal, 0),
		cursor: toJsonCursor({ window, until: until.getTime(), groupTotals }),
	}
}

/**
 * Returns the first page from each group's first rows in the groups' order, with each group's row count.
 */
export function toFirstNewsPage<Row extends { total: number }>(
	groupRows: Row[][],
	pageSize = NEWS_PAGE_SIZE,
): { newsEventRows: Row[]; groupTotals: NewsCursor["groupTotals"] } {
	const [ownRows = [], teamRows = [], followedRows = []] = groupRows
	return {
		newsEventRows: [...ownRows, ...teamRows, ...followedRows].slice(0, pageSize),
		groupTotals: [ownRows[0]?.total ?? 0, teamRows[0]?.total ?? 0, followedRows[0]?.total ?? 0],
	}
}

/**
 * Loads a page's rows: from the page's offset, one group after another, until the page is full.
 */
export async function loadNewsEventRowsFrom<Row>(
	{
		offset,
		groupTotals,
		pageSize = NEWS_PAGE_SIZE,
	}: { offset: number; groupTotals: NewsCursor["groupTotals"]; pageSize?: number },
	loadGroupRows: (group: NewsGroup, offset: number, limit: number) => Promise<Row[]>,
): Promise<Row[]> {
	const newsEventRows: Row[] = []
	let groupStart = 0

	// read each group the page reaches, from where the page starts inside it
	for (const [groupIndex, group] of newsGroups.entries()) {
		const groupTotal = groupTotals[groupIndex] ?? 0
		const groupOffset = Math.max(0, offset - groupStart)
		// skip a group the earlier pages finished, and stop reading once the page is full
		if (groupOffset < groupTotal && newsEventRows.length < pageSize) {
			newsEventRows.push(...(await loadGroupRows(group, groupOffset, pageSize - newsEventRows.length)))
		}
		groupStart += groupTotal
	}
	return newsEventRows
}

/**
 * Returns a row as the news shows it, with the path that opens its page, its Finding, or its Comment.
 */
export function toNewsEvent(newsEventRow: Omit<NewsEventRow, "total">): NewsEvent {
	// the page of the row: a Topic Post's own page, a Finding on its Topic's page, a Podcast Episode's page, or the Topic
	const topic = { id: newsEventRow.topicId, name: newsEventRow.topicName }
	const pagePath = newsEventRow.topicPostId
		? toTopicPostPath(topic, { id: newsEventRow.topicPostId, title: newsEventRow.title ?? "" })
		: toSocialTargetPath(topic, newsEventRow)
	const { actorUserId, actorUsername, commentAuthorUserId, commentAuthorUsername } = newsEventRow

	// the row's own image: its Podcast Episode's, or its published Topic Post's
	const { podcastEpisodeId, podcastEpisodeImageHash, topicPostId, topicPostImageHash } = newsEventRow
	const ownImage =
		podcastEpisodeId && podcastEpisodeImageHash
			? toPodcastEpisodeImageUrls(podcastEpisodeId, podcastEpisodeImageHash)
			: topicPostId && topicPostImageHash
				? toTopicPostImageUrls(topicPostId, topicPostImageHash)
				: null

	// a row with no image of its own shows its Topic's
	const image = ownImage ?? toTopicImageUrlsOrNull(topic.id, newsEventRow.topicImageHash)
	return {
		// the kind and the record make the id. a Comment and the reactions on it are two rows
		id: `${newsEventRow.kind}:${newsEventRow.id}`,
		kind: newsEventRow.kind,
		occurredAt: new Date(newsEventRow.occurredAt).toISOString(),
		topicId: topic.id,
		topicName: topic.name,
		image,
		path: newsEventRow.commentId ? toCommentPath(pagePath, newsEventRow.commentId) : pagePath,
		// the Finding and the Podcast Episode the row is about, which its play button reads
		findingId: newsEventRow.findingId,
		podcastEpisodeId,
		topicPostId,
		listenerCount: newsEventRow.listenerCount,
		// who did it, and what the row says
		actor: actorUserId && actorUsername ? { userId: actorUserId, username: actorUsername } : null,
		title: newsEventRow.title,
		text: newsEventRow.kind === "comment" ? toCommentFirstLine(newsEventRow.body ?? "") : null,
		reactionType: newsEventRow.reactionType,
		reactionCount: newsEventRow.reactionCount,
		commentAuthor:
			commentAuthorUserId && commentAuthorUsername
				? { userId: commentAuthorUserId, username: commentAuthorUsername }
				: null,
	}
}
