// profile cards tests: the person's own pinned rows lead, a visitor reads public topics alone, the person's tiles and
// table take their teams' topics, each other topic shows one film and one podcast episode, and a profile and a team
// list every published Topic Post from one read of the posts
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { topics } from "@carlnotes/db/schema/topics"
import { getTableColumns } from "drizzle-orm"
import * as topicCards from "./home/topicCards"
import {
	loadProfileCards,
	loadProfilePodcastEpisodeIds,
	loadProfileTableTopicRows,
	loadProfileTopicPodcastEpisodeVideoIds,
	loadProfileTopicPostCards,
	loadProfileTopicRows,
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

test("a visitor's tiles take public topics of the person and of public teams they lead, and the person's take all", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTopicRows({ profileUserId: "user-1", includesNonPublicTopics: false })
	await loadProfileTopicRows({ profileUserId: "user-1", includesNonPublicTopics: true })

	// both reads take the topics the person owns, and the ones that teams they lead own or have shared in
	for (const sentQuery of sentQueries) {
		expect(sentQuery.text).toContain('"topics"."owner_id" = $1 or')
		expect(sentQuery.text).toContain('"topics"."team_id" in (select "team_members"."team_id"')
		expect(sentQuery.text).toContain('"topics"."id" in (select "topic_id" from "team_topics"')
		expect(sentQuery.text).toContain('"team_members"."role" =')
	}

	// the visitor's read keeps public teams and public topics alone, and the person's keeps every one
	expect(sentQueries[0]?.text).toContain('"teams"."is_public" =')
	expect(sentQueries[0]?.text).toContain('"topics"."visibility" =')
	expect(sentQueries[1]?.text).not.toContain('"teams"."is_public"')
	expect(sentQueries[1]?.text).not.toContain('"topics"."visibility"')
})

test("the person's own table takes every topic of every team they are an active member of", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTableTopicRows("user-1")

	// the owned topics and every team's, leader or not, at every visibility
	expect(sentQueries[0]?.text).toContain('"topics"."owner_id" = $1 or')
	expect(sentQueries[0]?.text).toContain('"team_members"."is_active" =')
	expect(sentQueries[0]?.text).not.toContain('"team_members"."role"')
	expect(sentQueries[0]?.text).not.toContain('"topics"."visibility"')
})

// the profile order: the pinned ones by their position and the newest first at one position, then the unpinned ones most
// viewed, most followed, and newest
const PROFILE_ORDER_SQL =
	'order by "topics"."profile_order" is null, "topics"."profile_order" asc, case when "topics"."profile_order" is null then "topics"."viewer_count" end desc, case when "topics"."profile_order" is null then "topics"."subscriber_count" end desc, "topics"."created_at" desc'

test("topics read the person's own pins first in their order, then most viewed, most followed, and newest", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await loadProfileTopicRows({ profileUserId: "user-1", includesNonPublicTopics: false })

	// a pin counts only on a topic the person owns, so a team topic's pin by its owner does not lead
	const ownPinPosition = 'case when "topics"."owner_id" = $11 then "topics"."profile_order" end'
	expect(sentQueries[0]?.text).toContain(`order by ${ownPinPosition} is null`)
	expect(sentQueries[0]?.values.slice(10, 14)).toEqual(["user-1", "user-1", "user-1", "user-1"])
})

test("a team's cards read its topics in the same order, and a team with none reads nothing", async () => {
	const sentQueries = stubConnectionPool(() => [])
	expect(await loadTeamCards([], "user-1")).toEqual({ topicCards: [], podcastEpisodeCards: [], topicPostCards: [] })
	expect(sentQueries).toHaveLength(0)

	// the topics the reader may open, in the profile order
	await loadTeamCards(["topic-a", "topic-b"], "user-1")
	const topicRead = sentQueries.find(({ text }) => text.includes('from "topics"'))
	expect(topicRead?.text).toContain('"topics"."id" in ($1, $2)')
	expect(topicRead?.text).toContain(PROFILE_ORDER_SQL)
})

test("with no pin, each topic shows its first podcast episode read", () => {
	const profileSectionRowIds = toProfileSectionRowIds([
		{ id: "episode-a2", topicId: "topic-a", profileOrder: null },
		{ id: "episode-b1", topicId: "topic-b", profileOrder: null },
		{ id: "episode-a1", topicId: "topic-a", profileOrder: null },
	])
	expect(profileSectionRowIds).toEqual({ rowIds: ["episode-a2", "episode-b1"], pinnedCount: 0 })
})

test("every pinned podcast episode shows, two of one topic included, and that topic adds no other", () => {
	const profileSectionRowIds = toProfileSectionRowIds([
		{ id: "episode-a1", topicId: "topic-a", profileOrder: 1 },
		{ id: "episode-a2", topicId: "topic-a", profileOrder: 2 },
		{ id: "episode-a3", topicId: "topic-a", profileOrder: null },
		{ id: "episode-b1", topicId: "topic-b", profileOrder: null },
	])
	expect(profileSectionRowIds).toEqual({ rowIds: ["episode-a1", "episode-a2", "episode-b1"], pinnedCount: 2 })
})

test("a person with no topic reads no podcast episode", async () => {
	const sentQueries = stubConnectionPool(() => [])
	expect(await loadProfilePodcastEpisodeIds([])).toEqual({ podcastEpisodeIds: [], pinnedPodcastEpisodeCount: 0 })
	expect(sentQueries).toHaveLength(0)
})

test("the films read takes the topics' published podcast episodes with a ready film, the pinned films first", async () => {
	// a person with no topic reads no film
	const sentQueries = stubConnectionPool(() => [])
	expect(await loadProfileTopicPodcastEpisodeVideoIds([])).toEqual({
		podcastEpisodeIds: [],
		pinnedTopicPodcastEpisodeVideoCount: 0,
	})
	expect(sentQueries).toHaveLength(0)

	// the read joins the ready films of the topics' published podcast episodes
	await loadProfileTopicPodcastEpisodeVideoIds(["topic-a", "topic-b"])
	const [filmRead] = sentQueries
	expect(filmRead?.text).toContain(
		'inner join "topic_podcast_episode_videos" on ("topic_podcast_episode_videos"."episode_id" = "episodes"."id" and "topic_podcast_episode_videos"."status" = $1)',
	)
	expect(filmRead?.text).toContain('"episodes"."topic_id" in ($2, $3)')
	expect(filmRead?.values.slice(0, 4)).toEqual(["ready", "topic-a", "topic-b", "published"])

	// the pinned films lead in their own order, then the most listened, newest first among ties
	expect(filmRead?.text).toContain(
		'order by "topic_podcast_episode_videos"."profile_order" is null, "topic_podcast_episode_videos"."profile_order" asc, case when "topic_podcast_episode_videos"."profile_order" is null then "episodes"."listener_count" end desc, "episodes"."published_at" desc',
	)
})

// a topic row in the table's column order, with its id and its visibility. every other column is null
function toTopicRowValues(id: string, visibility: "public" | "private"): unknown[] {
	const topicValues: Record<string, unknown> = { id, visibility }
	return Object.keys(getTableColumns(topics)).map((columnKey) => topicValues[columnKey] ?? null)
}

// a person with a pinned film on a public topic and a film on a private topic. a read that filters on visibility
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
		if (!text.includes('inner join "topic_podcast_episode_videos"')) {
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
	const visitorTopicRows = await loadProfileTopicRows({ profileUserId: "user-1", includesNonPublicTopics: false })
	const visitorCards = await loadProfileCards({ topicRows: visitorTopicRows, profileUserId: "user-1", userId: null })
	const ownTopicRows = await loadProfileTopicRows({ profileUserId: "user-1", includesNonPublicTopics: true })
	const ownCards = await loadProfileCards({ topicRows: ownTopicRows, profileUserId: "user-1", userId: "user-1" })

	// the visitor's section holds the public topic's film alone
	expect(visitorCards.profileTopicPodcastEpisodeVideos.map((filmCard) => filmCard.podcastEpisode.id)).toEqual([
		"episode-public",
	])
	expect(visitorCards.pinnedTopicPodcastEpisodeVideoCount).toBe(1)

	// the person's holds both, the pinned film first, each with whether its topic is public
	expect(
		ownCards.profileTopicPodcastEpisodeVideos.map((filmCard) => [filmCard.podcastEpisode.id, filmCard.isTopicPublic]),
	).toEqual([
		["episode-public", true],
		["episode-private", false],
	])
	expect(ownCards.pinnedTopicPodcastEpisodeVideoCount).toBe(1)
})

test("a podcast episode in both sections is read once, and each section keeps its own order", async () => {
	// the film read returns a pinned film and another topic's, and the podcast episode read the same two the other way
	stubProfileFilms()
	restoreConnectionPool()
	stubConnectionPool(({ text }) => {
		const isFilmRead = text.includes('inner join "topic_podcast_episode_videos"')
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

// the profile order of Topic Posts: the pinned ones by their position, then the newest first
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
	await loadTeamCards(["topic-a", "topic-b"], "user-1")

	// one read of the posts among the queries sent
	const topicPostReads = sentQueries.filter(({ text }) => text.includes('from "topic_posts"'))
	expect(topicPostReads).toHaveLength(1)
	expect(topicPostReads[0]?.text).toContain('"topic_posts"."topic_id" in ($1, $2)')
	expect(topicPostReads[0]?.text).toContain('"topic_posts"."published_at" is not null')
	expect(topicPostReads[0]?.text).toContain(TOPIC_POST_ORDER_SQL)
	expect(topicPostReads[0]?.text).not.toContain("limit")
})

test("a profile's Topic Posts are every one: the pinned ones, then the rest newest first, with no limit", async () => {
	// a row with its topic, its visibility, its profile order, and the day of November it was published. the test reads
	// only the fields below
	const toTopicPostRow = (id: string, topicId: string, profileOrder: number | null, day: number): TopicPostRow =>
		({
			topicPost: { id, topicId, profileOrder, publishedAt: new Date(Date.UTC(2026, 10, day)) },
			topic: { id: topicId, visibility: topicId === "topic-a" ? "public" : "private" },
		}) as TopicPostRow

	// the rows in the profile order: the pinned post, then the rest newest first
	spyOn(topicPosts, "loadProfileOrderTopicPostRows").mockResolvedValue([
		toTopicPostRow("post-a-pinned", "topic-a", 1, 1),
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

	// every post in the order read, each with whether its topic is public, and the pinned one counted
	expect(
		profileTopicPostCards.profileTopicPosts.map((topicPostCard) => [topicPostCard.id, topicPostCard.isTopicPublic]),
	).toEqual([
		["post-a-pinned", true],
		["post-a-new", true],
		["post-b-new", false],
		["post-b-old", false],
	])
	expect(profileTopicPostCards.pinnedTopicPostCount).toBe(1)
	expect(profileTopicPostCards).not.toHaveProperty("topicPosts")
})

test("a profile lists more than twelve pinned Topic Posts and every other one, in one read of the posts", async () => {
	// fourteen pinned posts and six more, all on one topic
	const topicPostRows = Array.from({ length: 20 }, (_, i) => ({
		topicPost: { id: `post-${i}`, topicId: "topic-a", profileOrder: i < 14 ? i + 1 : null, publishedAt: new Date() },
		topic: { id: "topic-a", visibility: "public" },
	})) as TopicPostRow[]
	const loadRowsSpy = spyOn(topicPosts, "loadProfileOrderTopicPostRows").mockResolvedValue(topicPostRows)
	spyOn(topicPosts, "toTopicPostCards").mockImplementation(async (rows) =>
		rows.map(({ topicPost }) => ({ id: topicPost.id }) as never),
	)

	// a visitor's list holds all twenty, the fourteen pinned ones first
	const profileTopicPostCards = await loadProfileTopicPostCards("user-1", false)
	expect(profileTopicPostCards.profileTopicPosts).toHaveLength(20)
	expect(profileTopicPostCards.pinnedTopicPostCount).toBe(14)
	expect(loadRowsSpy).toHaveBeenCalledTimes(1)
})

test("a team's Topic Post cards are every post read, in the order read, from one read of the posts and their reactions", async () => {
	// a pinned post and a newer one on topic a, and two on topic b. the test reads only the fields below
	const toTopicPostRow = (id: string, topicId: string, profileOrder: number | null): TopicPostRow =>
		({ topicPost: { id, topicId, profileOrder, publishedAt: new Date() }, topic: { id: topicId } }) as TopicPostRow
	stubConnectionPool(() => [])
	const loadRowsSpy = spyOn(topicPosts, "loadProfileOrderTopicPostRows").mockResolvedValue([
		toTopicPostRow("post-a-pinned", "topic-a", 1),
		toTopicPostRow("post-a-new", "topic-a", null),
		toTopicPostRow("post-b-new", "topic-b", null),
		toTopicPostRow("post-b-old", "topic-b", null),
	])
	const toCardsSpy = spyOn(topicPosts, "toTopicPostCards").mockImplementation(async (rows) =>
		rows.map(({ topicPost }) => ({ id: topicPost.id }) as never),
	)

	// all four posts in the order read
	const { topicPostCards } = await loadTeamCards(["topic-a", "topic-b"], "user-1")
	expect(topicPostCards.map((topicPostCard) => topicPostCard.id)).toEqual([
		"post-a-pinned",
		"post-a-new",
		"post-b-new",
		"post-b-old",
	])

	// one read of the rows, and one call for their cards, which reads their reactions once
	expect(loadRowsSpy).toHaveBeenCalledTimes(1)
	expect(toCardsSpy).toHaveBeenCalledTimes(1)
})
