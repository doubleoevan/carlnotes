// profile cards tests: the person's own featured rows lead, a visitor reads public topics alone and no hidden membership,
// the person's tiles and table take their teams' topics but another member's unconverted private one, each other topic
// shows one film and one podcast episode, and a profile and a team list every published Topic Post from one read of the
// posts
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { topics } from "@carlnotes/db/schema/topics"
import { getTableColumns } from "drizzle-orm"
import * as topicCards from "./home/topicCards"
import {
	compareTeamTopicProfileOrder,
	loadProfileCards,
	loadProfilePodcastEpisodeIds,
	loadProfileTableTopicRows,
	loadProfileTopicPostCards,
	loadProfileTopicRows,
	loadProfileTopicVideoIds,
	loadTeamCards,
	toProfileSectionRowIds,
} from "./profileCards"
import type { TopicPostRow } from "./topicPost/topicPosts"
import * as topicPosts from "./topicPost/topicPosts"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a visitor's tiles take public topics of the person and of public teams that show the membership", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTopicRows({ profileUserId: "user-1", profileReader: "visitor" })
	await loadProfileTopicRows({ profileUserId: "user-1", profileReader: "person" })

	// both reads take the topics the person owns, and the ones that teams they lead own or have shared in
	for (const sentQuery of sentQueries) {
		expect(sentQuery.text).toContain('"topics"."owner_id" = $1')
		expect(sentQuery.text).toContain('"topics"."team_id" in (select "team_members"."team_id"')
		expect(sentQuery.text).toContain('"topics"."id" in (select "topic_id" from "team_topics"')
		expect(sentQuery.text).toContain('"team_members"."role" =')
	}

	// the visitor's read keeps public topics, and public teams that show the membership
	expect(sentQueries[0]?.text).toContain('"teams"."is_public" =')
	expect(sentQueries[0]?.text).toContain('"team_members"."is_member_visible" =')
	expect(sentQueries[0]?.text).toContain('"topics"."visibility" =')
	expect(sentQueries[0]?.text).not.toContain('"topic_personal_source_contexts"')

	// the person's read keeps every team, and leaves out another member's unconverted private topic
	expect(sentQueries[1]?.text).not.toContain('"teams"."is_public"')
	expect(sentQueries[1]?.text).not.toContain('"team_members"."is_member_visible"')
	expect(sentQueries[1]?.text).toContain('"topics"."visibility" <>')
	expect(sentQueries[1]?.text).toContain(
		'"topics"."id" not in (select "topic_id" from "topic_personal_source_contexts"',
	)
})

test("an admin's tiles take the person's own private topic only once its Personal sources text is converted", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTopicRows({ profileUserId: "user-1", profileReader: "admin" })

	// the person's own topics, every one but an unconverted private one, and every team's as the person reads them
	expect(sentQueries[0]?.text).toContain(
		'("topics"."owner_id" = $1 and ("topics"."visibility" <> $2 or "topics"."id" not in',
	)
	expect(sentQueries[0]?.text).not.toContain('"teams"."is_public"')
})

test("the person's own table takes every topic of every team they are an active member of", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTableTopicRows("user-1")

	// the owned topics and every team's, leader or not, but another member's unconverted private topic
	expect(sentQueries[0]?.text).toContain('"topics"."owner_id" = $1 or')
	expect(sentQueries[0]?.text).toContain('"team_members"."is_active" =')
	expect(sentQueries[0]?.text).not.toContain('"team_members"."role"')
	expect(sentQueries[0]?.text).toContain('"topics"."visibility" <>')
	expect(sentQueries[0]?.text).toContain('"topic_personal_source_contexts"')
})

test("topics read the person's own featured items first in their order, then most viewed, most followed, and newest", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTopicRows({ profileUserId: "user-1", profileReader: "visitor" })

	// a featured position counts only on a topic the person owns, so a team topic its owner features does not lead
	const ownFeaturePosition = 'case when "topics"."owner_id" = $14 then "topics"."profile_order" end'
	expect(sentQueries[0]?.text).toContain(`order by ${ownFeaturePosition} is null`)
	expect(sentQueries[0]?.values.slice(13, 17)).toEqual(["user-1", "user-1", "user-1", "user-1"])
})

// a team topic row named by its id, with its featured position, its views, its followers, and the day of November it was created. the
// test reads only these fields
function toTeamTopicRow(
	id: string,
	{ profileOrder = null, viewerCount = 0, subscriberCount = 0, day = 1 }: Partial<Record<string, number | null>> = {},
): typeof topics.$inferSelect {
	return {
		id,
		name: id,
		profileOrder,
		viewerCount,
		subscriberCount,
		createdAt: new Date(Date.UTC(2026, 10, day ?? 1)),
	} as typeof topics.$inferSelect
}

// two topics the reader may open
const TEAM_TOPIC_ROWS = [toTeamTopicRow("topic-a"), toTeamTopicRow("topic-b")]

test("a team with no topic reads nothing for its cards", async () => {
	const sentQueries = stubConnectionPool(() => [])
	expect(await loadTeamCards([], "user-1")).toEqual({
		topicCards: [],
		podcastEpisodeCards: [],
		topicVideoCards: [],
		topicPostCards: [],
	})
	expect(sentQueries).toHaveLength(0)
})

test("a team's topics sort as the profile order's sql does: featured by position and newest, then views, followers, newest", () => {
	const topicRows = [
		toTeamTopicRow("unfeatured-old", { day: 1 }),
		toTeamTopicRow("unfeatured-followed", { subscriberCount: 3 }),
		toTeamTopicRow("featured-2", { profileOrder: 2 }),
		toTeamTopicRow("unfeatured-viewed", { viewerCount: 9 }),
		toTeamTopicRow("featured-1-old", { profileOrder: 1, day: 1 }),
		toTeamTopicRow("featured-1-new", { profileOrder: 1, day: 5 }),
		toTeamTopicRow("unfeatured-new", { day: 7 }),
	]
	expect(topicRows.toSorted(compareTeamTopicProfileOrder).map((topicRow) => topicRow.id)).toEqual([
		"featured-1-new",
		"featured-1-old",
		"featured-2",
		"unfeatured-viewed",
		"unfeatured-followed",
		"unfeatured-new",
		"unfeatured-old",
	])
})

test("with nothing featured, each topic shows its first podcast episode read", () => {
	const profileSectionRowIds = toProfileSectionRowIds([
		{ id: "episode-a2", topicId: "topic-a", profileOrder: null },
		{ id: "episode-b1", topicId: "topic-b", profileOrder: null },
		{ id: "episode-a1", topicId: "topic-a", profileOrder: null },
	])
	expect(profileSectionRowIds).toEqual({ rowIds: ["episode-a2", "episode-b1"], featuredCount: 0 })
})

test("every featured podcast episode shows, two of one topic included, and that topic adds no other", () => {
	const profileSectionRowIds = toProfileSectionRowIds([
		{ id: "episode-a1", topicId: "topic-a", profileOrder: 1 },
		{ id: "episode-a2", topicId: "topic-a", profileOrder: 2 },
		{ id: "episode-a3", topicId: "topic-a", profileOrder: null },
		{ id: "episode-b1", topicId: "topic-b", profileOrder: null },
	])
	expect(profileSectionRowIds).toEqual({ rowIds: ["episode-a1", "episode-a2", "episode-b1"], featuredCount: 2 })
})

test("a person with no topic reads no podcast episode", async () => {
	const sentQueries = stubConnectionPool(() => [])
	expect(await loadProfilePodcastEpisodeIds([])).toEqual({ podcastEpisodeIds: [], pinnedPodcastEpisodeCount: 0 })
	expect(sentQueries).toHaveLength(0)
})

test("the films read takes the topics' published podcast episodes with a ready film, the featured films first", async () => {
	// a person with no topic reads no film
	const sentQueries = stubConnectionPool(() => [])
	expect(await loadProfileTopicVideoIds([])).toEqual({
		podcastEpisodeIds: [],
		pinnedTopicPodcastEpisodeVideoCount: 0,
	})
	expect(sentQueries).toHaveLength(0)

	// the read joins the ready films of the topics' published podcast episodes
	await loadProfileTopicVideoIds(["topic-a", "topic-b"])
	const [filmRead] = sentQueries
	expect(filmRead?.text).toContain(
		'inner join "topic_videos" on ("topic_videos"."episode_id" = "episodes"."id" and "topic_videos"."status" = $1)',
	)
	expect(filmRead?.text).toContain('"episodes"."topic_id" in ($2, $3)')
	expect(filmRead?.values.slice(0, 4)).toEqual(["ready", "topic-a", "topic-b", "published"])

	// the featured films lead in their own order, then the most listened, newest first among ties
	expect(filmRead?.text).toContain(
		'order by "topic_videos"."profile_order" is null, "topic_videos"."profile_order" asc, case when "topic_videos"."profile_order" is null then "episodes"."listener_count" end desc, "episodes"."published_at" desc',
	)
})

// a topic row in the table's column order, with its id and its visibility. every other column is null
function toTopicRowValues(id: string, visibility: "public" | "private"): unknown[] {
	const topicValues: Record<string, unknown> = { id, visibility }
	return Object.keys(getTableColumns(topics)).map((columnKey) => topicValues[columnKey] ?? null)
}

// a person with a featured film on a public topic and a film on a private topic. a read that filters on visibility
// gets the public topic alone, and the films read gets the films of the topics it names
function stubProfileFilms(): void {
	stubConnectionPool(({ text, values }) => {
		// the person's topics
		if (text.includes('from "topics"')) {
			const isPublicRead = text.includes('"topics"."visibility" =')
			return [
				toTopicRowValues("topic-public", "public"),
				...(isPublicRead ? [] : [toTopicRowValues("topic-private", "private")]),
			]
		}

		// the films of the topics the read names, and no podcast episode beside them
		if (!text.includes('inner join "topic_videos"')) {
			return []
		}
		const filmRows = [
			["episode-public", "topic-public", 1],
			["episode-private", "topic-private", null],
		]
		return filmRows.filter(([, topicId]) => values.includes(topicId))
	})

	// each topic's card by its id, and each podcast episode's card by its id and its topic's
	spyOn(topicCards, "toTopicCards").mockImplementation(async (topicRows) =>
		topicRows.map((topicRow) => ({ id: topicRow.id }) as never),
	)
	spyOn(topicCards, "loadPodcastEpisodeCards").mockImplementation(async (podcastEpisodeIds) =>
		podcastEpisodeIds.map(
			(podcastEpisodeId) =>
				({
					podcastEpisode: { id: podcastEpisodeId },
					topic: { id: podcastEpisodeId.replace("episode", "topic") },
				}) as never,
		),
	)
}

test("a visitor sees a person's films on public topics alone, and the person sees every film", async () => {
	stubProfileFilms()
	const visitorTopicRows = await loadProfileTopicRows({ profileUserId: "user-1", profileReader: "visitor" })
	const visitorCards = await loadProfileCards({ topicRows: visitorTopicRows, profileUserId: "user-1", userId: null })
	const ownTopicRows = await loadProfileTopicRows({ profileUserId: "user-1", profileReader: "person" })
	const ownCards = await loadProfileCards({ topicRows: ownTopicRows, profileUserId: "user-1", userId: "user-1" })

	// the visitor's section holds the public topic's film alone
	expect(visitorCards.profileTopicPodcastEpisodeVideos.map((filmCard) => filmCard.podcastEpisode.id)).toEqual([
		"episode-public",
	])
	expect(visitorCards.pinnedTopicPodcastEpisodeVideoCount).toBe(1)

	// the person's holds both, the featured film first, each with whether its topic is public
	expect(
		ownCards.profileTopicPodcastEpisodeVideos.map((filmCard) => [filmCard.podcastEpisode.id, filmCard.isTopicPublic]),
	).toEqual([
		["episode-public", true],
		["episode-private", false],
	])
	expect(ownCards.pinnedTopicPodcastEpisodeVideoCount).toBe(1)
})

test("a podcast episode in both sections is read once, and each section keeps its own order", async () => {
	// the film read returns a featured film and another topic's, and the podcast episode read the same two the other way
	stubProfileFilms()
	restoreConnectionPool()
	stubConnectionPool(({ text }) => {
		const isFilmRead = text.includes('inner join "topic_videos"')
		const filmRows = [
			["episode-public", "topic-public", 1],
			["episode-private", "topic-private", null],
		]
		return text.includes('from "episodes"') ? (isFilmRead ? filmRows : filmRows.toReversed()) : []
	})
	const topicRows = [{ id: "topic-public", visibility: "public", profileOrder: null }] as never
	const profileCards = await loadProfileCards({ topicRows, profileUserId: "user-1", userId: null })

	// one read of the cards, each podcast episode once
	expect(topicCards.loadPodcastEpisodeCards).toHaveBeenCalledTimes(1)
	expect(topicCards.loadPodcastEpisodeCards).toHaveBeenCalledWith(["episode-public", "episode-private"])

	// the films in the film read's order, and the podcast episodes in theirs
	const toPodcastEpisodeIds = (podcastEpisodeCards: { podcastEpisode: { id: string } }[]): string[] =>
		podcastEpisodeCards.map(({ podcastEpisode }) => podcastEpisode.id)
	expect(toPodcastEpisodeIds(profileCards.profileTopicPodcastEpisodeVideos)).toEqual([
		"episode-public",
		"episode-private",
	])
	expect(toPodcastEpisodeIds(profileCards.profilePodcastEpisodes)).toEqual(["episode-private", "episode-public"])
})

// the profile order of Topic Posts: the featured ones by their position, then the newest first
const TOPIC_POST_ORDER_SQL =
	'order by "topic_posts"."profile_order" is null, "topic_posts"."profile_order" asc, "topic_posts"."published_at" desc'

test("a visitor reads a person's published Topic Posts of public topics alone, and the person reads every one", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTopicPostCards("user-1", false)
	await loadProfileTopicPostCards("user-1", true)

	// both reads take the person's published posts in the profile order, and the first filters on visibility
	expect(sentQueries[0]?.text).toContain('"topic_posts"."published_at" is not null')
	expect(sentQueries[0]?.text).toContain('"topic_posts"."author_user_id" = $1')
	expect(sentQueries[0]?.text).toContain('"topics"."visibility" = $2')
	expect(sentQueries[0]?.text).toContain(TOPIC_POST_ORDER_SQL)
	expect(sentQueries[1]?.text).not.toContain('"topics"."visibility" =')
})

test("a team's Topic Post cards read the published posts of its topics once, in the profile order, with no limit", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadTeamCards(TEAM_TOPIC_ROWS, "user-1")

	// one read of the posts among the queries sent
	const topicPostReads = sentQueries.filter(({ text }) => text.includes('from "topic_posts"'))
	expect(topicPostReads).toHaveLength(1)
	expect(topicPostReads[0]?.text).toContain('"topic_posts"."topic_id" in ($1, $2)')
	expect(topicPostReads[0]?.text).toContain('"topic_posts"."published_at" is not null')
	expect(topicPostReads[0]?.text).toContain(TOPIC_POST_ORDER_SQL)
	expect(topicPostReads[0]?.text).not.toContain("limit")
})

test("a profile's Topic Posts are every one: the featured ones, then the rest newest first, with no limit", async () => {
	// a row with its topic, its visibility, its profile order, and the day of November it was published. the test reads
	// only the fields below
	const toTopicPostRow = (id: string, topicId: string, profileOrder: number | null, day: number): TopicPostRow =>
		({
			topicPost: { id, topicId, profileOrder, publishedAt: new Date(Date.UTC(2026, 10, day)) },
			topic: { id: topicId, visibility: topicId === "topic-a" ? "public" : "private" },
		}) as TopicPostRow

	// the rows in the profile order: the featured post, then the rest newest first
	spyOn(topicPosts, "loadProfileOrderTopicPostRows").mockResolvedValue([
		toTopicPostRow("post-a-featured", "topic-a", 1, 1),
		toTopicPostRow("post-a-new", "topic-a", null, 9),
		toTopicPostRow("post-b-new", "topic-b", null, 8),
		toTopicPostRow("post-b-old", "topic-b", null, 2),
	])
	spyOn(topicPosts, "toTopicPostCards").mockImplementation(async (topicPostRows) =>
		topicPostRows.map(
			({ topicPost }) => ({ id: topicPost.id, publishedAt: topicPost.publishedAt?.toISOString() ?? null }) as never,
		),
	)
	const profileTopicPostCards = await loadProfileTopicPostCards("user-1", true)

	// every post in the order read, each with whether its topic is public, and the featured one counted
	expect(
		profileTopicPostCards.profileTopicPosts.map((topicPostCard) => [topicPostCard.id, topicPostCard.isTopicPublic]),
	).toEqual([
		["post-a-featured", true],
		["post-a-new", true],
		["post-b-new", false],
		["post-b-old", false],
	])
	expect(profileTopicPostCards.pinnedTopicPostCount).toBe(1)
	expect(profileTopicPostCards).not.toHaveProperty("topicPosts")
})

test("a profile lists more than twelve featured Topic Posts and every other one, in one read of the posts", async () => {
	// fourteen featured posts and six more, all on one topic
	const topicPostRows = Array.from({ length: 20 }, (_, i) => ({
		topicPost: { id: `post-${i}`, topicId: "topic-a", profileOrder: i < 14 ? i + 1 : null, publishedAt: new Date() },
		topic: { id: "topic-a", visibility: "public" },
	})) as TopicPostRow[]
	const loadRowsSpy = spyOn(topicPosts, "loadProfileOrderTopicPostRows").mockResolvedValue(topicPostRows)
	spyOn(topicPosts, "toTopicPostCards").mockImplementation(async (rows) =>
		rows.map(({ topicPost }) => ({ id: topicPost.id }) as never),
	)

	// a visitor's list holds all twenty, the fourteen featured ones first
	const profileTopicPostCards = await loadProfileTopicPostCards("user-1", false)
	expect(profileTopicPostCards.profileTopicPosts).toHaveLength(20)
	expect(profileTopicPostCards.pinnedTopicPostCount).toBe(14)
	expect(loadRowsSpy).toHaveBeenCalledTimes(1)
})

test("a team's Topic Post cards are every post read, in the order read, from one read of the posts and their reactions", async () => {
	// a featured post and a newer one on topic a, and two on topic b. the test reads only the fields below
	const toTopicPostRow = (id: string, topicId: string, profileOrder: number | null): TopicPostRow =>
		({ topicPost: { id, topicId, profileOrder, publishedAt: new Date() }, topic: { id: topicId } }) as TopicPostRow
	stubConnectionPool(() => [])
	const loadRowsSpy = spyOn(topicPosts, "loadProfileOrderTopicPostRows").mockResolvedValue([
		toTopicPostRow("post-a-featured", "topic-a", 1),
		toTopicPostRow("post-a-new", "topic-a", null),
		toTopicPostRow("post-b-new", "topic-b", null),
		toTopicPostRow("post-b-old", "topic-b", null),
	])
	const toCardsSpy = spyOn(topicPosts, "toTopicPostCards").mockImplementation(async (rows) =>
		rows.map(({ topicPost }) => ({ id: topicPost.id }) as never),
	)

	// all four posts in the order read
	const { topicPostCards } = await loadTeamCards(TEAM_TOPIC_ROWS, "user-1")
	expect(topicPostCards.map((topicPostCard) => topicPostCard.id)).toEqual([
		"post-a-featured",
		"post-a-new",
		"post-b-new",
		"post-b-old",
	])

	// one read of the rows, and one call for their cards, which reads their reactions once
	expect(loadRowsSpy).toHaveBeenCalledTimes(1)
	expect(toCardsSpy).toHaveBeenCalledTimes(1)
})
