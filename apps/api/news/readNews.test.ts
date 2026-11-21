// the news read's pure parts: each Topic in its first group, the first page and its counts, a later page across the
// groups, the cursor, a row as the news shows it, and an admin's read of someone's news
import { expect, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as authorization from "../authorization"
import { parseJsonCursor, toJsonCursor } from "../cursors"
import type { NewsEventRow } from "./newsEventRows"
import { toNewsPodcastEpisodeIds } from "./newsPodcastEpisodes"
import { toNewsTopicIds } from "./newsTopics"
import { loadNewsEventRowsFrom, newsCursor, readNews, toFirstNewsPage, toNewsEvent } from "./readNews"

// a row of one group, counted with the others of its group
const toGroupRows = (group: string, rowCount: number, total: number): { id: string; total: number }[] =>
	Array.from({ length: rowCount }, (_, i) => ({ id: `${group}-${i}`, total }))

// a row as the read returns it, with nothing but its kind, record, time, and Topic
function toNewsEventRow(newsEventRow: Partial<NewsEventRow>): Omit<NewsEventRow, "total"> {
	return {
		// the kind, the record, the time, and the Topic
		kind: "finding",
		id: "record-1",
		occurredAt: new Date("2026-11-09T12:00:00Z"),
		topicId: "topic-1",
		topicName: "Home espresso",
		// nobody did it, and it says nothing
		actorUserId: null,
		actorUsername: null,
		title: null,
		body: null,
		reactionType: null,
		reactionCount: null,
		// its link opens the Topic
		findingId: null,
		season: null,
		episodeNumber: null,
		topicPostId: null,
		commentId: null,
		commentAuthorUserId: null,
		commentAuthorUsername: null,
		// neither its Topic, a Topic Post, nor a Podcast Episode has an image, and it counts no listeners
		topicImageHash: null,
		topicPostImageHash: null,
		podcastEpisodeId: null,
		podcastEpisodeImageHash: null,
		listenerCount: null,
		...newsEventRow,
	}
}

test("a row shows its Podcast Episode's own image, else its Topic's, else none", () => {
	const podcastEpisodeImage = { podcastEpisodeId: "episode-1", podcastEpisodeImageHash: "episodehash" }
	expect(
		toNewsEvent(toNewsEventRow({ topicImageHash: "topichash", ...podcastEpisodeImage })).image?.thumbnail.url,
	).toBe("/api/podcast-episode-images/episode-1/episodehash/thumbnail.webp")
	expect(
		toNewsEvent(toNewsEventRow({ topicImageHash: "topichash", podcastEpisodeId: "episode-1" })).image?.thumbnail.url,
	).toBe("/api/topic-images/topic-1/topichash/thumbnail.webp")
	expect(toNewsEvent(toNewsEventRow({})).image).toBeNull()
})

test("a published Topic Post's row names the post and shows its own image, else its Topic's", () => {
	const topicPostRow = { kind: "topicPost" as const, topicPostId: "post-1", topicImageHash: "topichash" }
	const newsEvent = toNewsEvent(toNewsEventRow({ ...topicPostRow, topicPostImageHash: "posthash" }))
	expect(newsEvent.topicPostId).toBe("post-1")
	expect(newsEvent.image?.thumbnail.url).toBe("/api/topic-post-images/post-1/posthash/thumbnail.webp")
	expect(toNewsEvent(toNewsEventRow(topicPostRow)).image?.thumbnail.url).toBe(
		"/api/topic-images/topic-1/topichash/thumbnail.webp",
	)
})

test("a Comment on a Topic Post names the post and keeps its Topic's image", () => {
	const commentRow = { kind: "comment" as const, commentId: "comment-1", topicPostId: "post-1" }
	const newsEvent = toNewsEvent(toNewsEventRow({ ...commentRow, topicImageHash: "topichash" }))
	expect(newsEvent.topicPostId).toBe("post-1")
	expect(newsEvent.image?.thumbnail.url).toBe("/api/topic-images/topic-1/topichash/thumbnail.webp")
})

test("a Podcast Episode's row includes its listeners, and every other row none", () => {
	const podcastEpisodeRow = toNewsEventRow({ kind: "podcastEpisode", podcastEpisodeId: "episode-1", listenerCount: 3 })
	expect(toNewsEvent(podcastEpisodeRow).listenerCount).toBe(3)
	expect(toNewsEvent(toNewsEventRow({})).listenerCount).toBeNull()
})

test("a page plays its Podcast Episode rows' own episodes and the latest of its Finding rows' Topics", () => {
	const newsPodcastEpisodeIds = toNewsPodcastEpisodeIds([
		{ kind: "podcastEpisode", topicId: "topic-1", podcastEpisodeId: "episode-1" },
		{ kind: "podcastEpisode", topicId: "topic-1", podcastEpisodeId: "episode-1" },
		{ kind: "finding", topicId: "topic-2", podcastEpisodeId: null },
		// a Comment on a Podcast Episode plays nothing, so its episode is not loaded
		{ kind: "comment", topicId: "topic-3", podcastEpisodeId: "episode-3" },
	])
	expect(newsPodcastEpisodeIds).toEqual({ podcastEpisodeIds: ["episode-1"], findingTopicIds: ["topic-2"] })
})

test("a Topic stays in the first group that holds it", () => {
	expect(toNewsTopicIds(["own", "both"], ["both", "team", "team"], ["own", "team", "followed"])).toEqual({
		own: ["own", "both"],
		team: ["team"],
		followed: ["followed"],
	})
})

test("the first page takes the groups in order and counts each one", () => {
	const firstNewsPage = toFirstNewsPage([toGroupRows("own", 3, 3), toGroupRows("team", 5, 31), []])
	expect(firstNewsPage.newsEventRows).toHaveLength(5)
	expect(firstNewsPage.newsEventRows.at(2)?.id).toBe("own-2")
	expect(firstNewsPage.newsEventRows.at(3)?.id).toBe("team-0")
	expect(firstNewsPage.groupTotals).toEqual([3, 31, 0])
})

test("a later page reads on from its offset, across a group's end", async () => {
	// 3 own rows, 9 team rows, and 6 followed rows, read at the third page of five
	const groupReads: [string, number, number][] = []
	const newsEventRows = await loadNewsEventRowsFrom({ offset: 10, groupTotals: [3, 9, 6] }, async (...groupRead) => {
		groupReads.push(groupRead)
		const [group, offset, limit] = groupRead
		return toGroupRows(group, Math.min(limit, (group === "team" ? 9 : 6) - offset), 0)
	})
	expect(groupReads).toEqual([
		["team", 7, 5],
		["followed", 0, 3],
	])
	expect(newsEventRows.map((newsEventRow) => newsEventRow.id)).toEqual([
		"team-0",
		"team-1",
		"followed-0",
		"followed-1",
		"followed-2",
	])
})

test("a cursor reads back as it was written, and other text is no cursor", () => {
	const groupTotals: [number, number, number] = [12, 31, 5]
	const pageCursor = { window: "day" as const, until: 1_794_000_000_000, groupTotals }
	expect(parseJsonCursor(newsCursor, toJsonCursor(pageCursor))).toEqual(pageCursor)
	expect(parseJsonCursor(newsCursor, "not a cursor")).toBeNull()
	expect(parseJsonCursor(newsCursor, Buffer.from('{"window":"year"}').toString("base64url"))).toBeNull()
})

test("a cursor whose time is later than a day from now, or past the last date, is no cursor", async () => {
	// a time a first read could have fixed is a cursor, and a time past tomorrow is not
	const groupTotals: [number, number, number] = [1, 0, 0]
	const toCursorText = (until: number): string => toJsonCursor({ window: "week", until, groupTotals })
	expect(parseJsonCursor(newsCursor, toCursorText(Date.now()))).not.toBeNull()
	expect(parseJsonCursor(newsCursor, toCursorText(Date.now() + 2 * 24 * 60 * 60 * 1000))).toBeNull()
	expect(parseJsonCursor(newsCursor, toCursorText(9_000_000_000_000_000))).toBeNull()

	// the read returns null for it before it reads anything, as it does for text that is no cursor
	const sentQueries = stubConnectionPool(() => [])
	const newsRead = { profileUserId: "user-1", userId: null, window: "week" as const, page: 2 }
	expect(await readNews({ ...newsRead, cursor: toCursorText(9_000_000_000_000_000) })).toBeNull()
	expect(sentQueries).toEqual([])
	restoreConnectionPool()
})

test("a Finding's row opens the Finding on its Topic's page", () => {
	const newsEvent = toNewsEvent(toNewsEventRow({ findingId: "finding-1", title: "Dialing in" }))
	expect(newsEvent).toMatchObject({
		id: "finding:record-1",
		occurredAt: "2026-11-09T12:00:00.000Z",
		path: "/topics/topic-1/home-espresso?finding=finding-1",
		title: "Dialing in",
		actor: null,
		text: null,
	})
})

test("a Podcast Episode's row opens its page, and a Topic Post's row its own", () => {
	const podcastEpisodeRow = toNewsEventRow({ kind: "podcastEpisode", season: 2026, episodeNumber: 4 })
	expect(toNewsEvent(podcastEpisodeRow).path).toBe("/topics/topic-1/home-espresso/episodes/2026/4")
	const topicPostRow = toNewsEventRow({ kind: "topicPost", topicPostId: "post-1", title: "Why I weigh every shot" })
	expect(toNewsEvent(topicPostRow).path).toBe("/topics/topic-1/home-espresso/posts/post-1/why-i-weigh-every-shot")
})

test("a Comment's row shows its author and first line, and opens the Comment on what it hangs on", () => {
	const newsEvent = toNewsEvent(
		toNewsEventRow({
			kind: "comment",
			actorUserId: "user-2",
			actorUsername: "RoastFan",
			body: "  https://example.com is wrong\nand here is why",
			commentId: "comment-1",
			findingId: "finding-1",
		}),
	)
	expect(newsEvent).toMatchObject({
		actor: { userId: "user-2", username: "RoastFan" },
		text: "https://example.com is wrong",
		path: "/topics/topic-1/home-espresso?finding=finding-1&comment=comment-1",
	})
})

test("the reactions on one Comment are a row of their own beside the Comment's", () => {
	const reactedComment = { id: "comment-1", commentId: "comment-1" }
	const newsEvent = toNewsEvent(
		toNewsEventRow({
			...reactedComment,
			kind: "reaction",
			reactionCount: 12,
			commentAuthorUserId: "user-1",
			commentAuthorUsername: "Evan",
		}),
	)
	expect(newsEvent).toMatchObject({
		id: "reaction:comment-1",
		reactionCount: 12,
		commentAuthor: { userId: "user-1", username: "Evan" },
		path: "/topics/topic-1/home-espresso?comment=comment-1",
	})
	expect(toNewsEvent(toNewsEventRow({ ...reactedComment, kind: "comment", body: "hi" })).id).toBe("comment:comment-1")
})

test("an admin reads someone's news as the person does, followed Topics included, but no unconverted private Topic, and anyone else does not", async () => {
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValueOnce(true).mockResolvedValueOnce(false)
	const newsRead = { profileUserId: "user-1", window: "week" as const, page: 1 }

	// the admin's read reads the Topics the person follows
	const isFollowedTopicRead = ({ text }: { text: string }): boolean =>
		text.startsWith('select "topics"."id" from "subscriptions"')
	const adminQueries = stubConnectionPool(() => [])
	await readNews({ ...newsRead, userId: "admin-1" })
	expect(adminQueries.some(isFollowedTopicRead)).toBe(true)

	// but not the person's own private Topic whose Personal sources text is not converted
	expect(
		adminQueries.some(({ text }) =>
			text.includes('("topics"."owner_id" = $1 and ("topics"."visibility" <> $2 or "topics"."id" not in'),
		),
	).toBe(true)
	restoreConnectionPool()

	// another user's read does not
	const userQueries = stubConnectionPool(() => [])
	await readNews({ ...newsRead, userId: "user-2" })
	expect(userQueries.some(isFollowedTopicRead)).toBe(false)
	restoreConnectionPool()
	expect(isAllowedSpy).toHaveBeenCalledWith("admin-1", "admin:console")
	isAllowedSpy.mockRestore()
})

test("a read with a cursor takes the totals from it and sends no count of the window", async () => {
	// a later page of the own group, read with the cursor of a week that holds 12 own rows
	const sentQueries = stubConnectionPool(() => [])
	const cursor = toJsonCursor({ window: "week", until: Date.now(), groupTotals: [12, 0, 0] })
	const newsRead = { profileUserId: "user-1", userId: null, window: "week" as const }
	const news = await readNews({ ...newsRead, page: 2, cursor })
	expect(news?.total).toBe(12)
	expect(sentQueries.some(({ text }) => text.includes("news_events"))).toBe(true)
	expect(sentQueries.some(({ text }) => text.includes("count(*) over ()"))).toBe(false)

	// a first read counts the window
	const firstReadQueries = stubConnectionPool(() => [])
	await readNews({ ...newsRead, page: 1 })
	expect(firstReadQueries.some(({ text }) => text.includes("count(*) over ()"))).toBe(true)
	restoreConnectionPool()
})

test("the own group reads its Comments, reactions, and Topic Posts from candidate ids that start at the person", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await readNews({ profileUserId: "user-1", userId: null, window: "week", page: 1 })
	restoreConnectionPool()

	// each arm keeps its filter and gains the candidate reads from the person's Comments and Topic Posts
	const ownGroupText = sentQueries.find(({ text }) => text.includes("news_events"))?.text ?? ""
	expect(ownGroupText).toContain('"comments"."id" in ((select "id" from "comments" "candidate_comments"')
	expect(ownGroupText).toContain(
		'"candidate_comments"."parent_comment_id" in (select "id" from "comments" "person_comments"',
	)
	expect(ownGroupText).toContain(
		'"candidate_comments"."post_id" in (select "id" from "topic_posts" "person_topic_posts"',
	)
	expect(ownGroupText).toContain('"candidate_reactions"."comment_id" in (select "id" from "comments" "person_comments"')
	expect(ownGroupText).toContain('"topic_posts"."id" in ((select "id" from "topic_posts" "candidate_topic_posts"')
})
