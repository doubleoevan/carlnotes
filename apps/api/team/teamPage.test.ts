// team page tests: a member reads the films and the Topic Posts of every topic of the team, a visitor and a pending
// invitee those of its public topics alone, a team with no film lists none, and the page lists every published Topic
// Post from one read of the posts and one read of their reactions
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topics } from "@carlnotes/db/schema/topics"
import * as mentions from "../chat/mentions"
import * as topicCards from "../home/topicCards"
import * as topicTableRows from "../topic/topicTableRows"
import type { TopicPostRow } from "../topicPost/topicPosts"
import * as topicPosts from "../topicPost/topicPosts"
import { loadTeamPage } from "./teamPage"
import * as teamPageAccess from "./teamPageAccess"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the ready films of published podcast episodes as the films read selects them: the podcast episode, its topic, and
// the film's profile order. the public topic's film is pinned
const FILM_ROWS = [
	["episode-public", "topic-public", 1],
	["episode-private", "topic-private", null],
]

// a public team that holds a public topic and a private topic, read by a member or by anyone else. the films read
// returns the given films of the topics it names, and every query sent is returned
function stubTeamPage(role: "member" | null, filmRows: unknown[][] = FILM_ROWS, isInvited = false): SentQuery[] {
	// the team opens for the reader, with no chat mention and no topic table row
	spyOn(teamPageAccess, "loadTeamPageAccess").mockResolvedValue({
		team: { id: "team-1", name: "Design Guild", description: null, isPublic: true, avatarKey: null } as never,
		role,
		hasRequestedToJoin: false,
		isInvited,
		canOpen: true,
	})
	spyOn(mentions, "loadTeamChatMentions").mockResolvedValue(new Map())
	spyOn(topicTableRows, "toTopicTableRows").mockResolvedValue([])

	// each podcast episode's card by its id, and each Topic Post's card by its id, in place of the reactions read
	spyOn(topicCards, "loadPodcastEpisodeCards").mockImplementation(async (podcastEpisodeIds) =>
		podcastEpisodeIds.map((podcastEpisodeId) => ({ podcastEpisode: { id: podcastEpisodeId } }) as never),
	)
	spyOn(topicPosts, "toTopicPostCards").mockImplementation(async (topicPostRows) =>
		topicPostRows.map(({ topicPost }) => ({ id: topicPost.id }) as never),
	)

	return stubConnectionPool(({ text, values }) => {
		// the films of the topics the read names
		if (text.includes('inner join "topic_podcast_episode_videos"')) {
			return filmRows.filter(([, topicId]) => values.includes(topicId))
		}

		// the team's own topics, one public and one private. every other read returns no row, so the team has no member,
		// no shared topic, no topic card, and no Topic Post
		const isOwnedTopicsRead = text.includes('from "topics"') && text.includes('"topics"."team_id" =')
		return isOwnedTopicsRead
			? [
					toTableRow(topics, { id: "topic-public", visibility: "public" }),
					toTableRow(topics, { id: "topic-private", visibility: "private" }),
				]
			: []
	})
}

// the page's film cards by their podcast episodes' ids, or null for a page that did not open
async function loadFilmPodcastEpisodeIds(userId: string | null): Promise<string[] | null> {
	const teamPageResult = await loadTeamPage(userId, "team-1")
	if (teamPageResult.status !== "visible") {
		return null
	}
	return (teamPageResult.team.topicPodcastEpisodeVideoCards ?? []).map((filmCard) => filmCard.podcastEpisode.id)
}

// the values of the Topic Posts read among the queries sent
function toTopicPostReadValues(sentQueries: SentQuery[]): unknown[] | undefined {
	return sentQueries.find(({ text }) => text.includes('from "topic_posts"'))?.values
}

test("a member sees the films and reads the Topic Posts of every topic of the team, the pinned film first", async () => {
	const sentQueries = stubTeamPage("member")
	expect(await loadFilmPodcastEpisodeIds("user-1")).toEqual(["episode-public", "episode-private"])
	expect(toTopicPostReadValues(sentQueries)).toEqual(["topic-public", "topic-private"])
})

test("a visitor sees the films and reads the Topic Posts of the team's public topics alone", async () => {
	const sentQueries = stubTeamPage(null)
	expect(await loadFilmPodcastEpisodeIds(null)).toEqual(["episode-public"])
	expect(toTopicPostReadValues(sentQueries)).toEqual(["topic-public"])
})

test("a pending invitee keeps every topic in the table and reads the cards of the public topics alone", async () => {
	const sentQueries = stubTeamPage(null, FILM_ROWS, true)
	expect(await loadFilmPodcastEpisodeIds("user-invited")).toEqual(["episode-public"])
	expect(toTopicPostReadValues(sentQueries)).toEqual(["topic-public"])

	// the topic cards and the podcast episode ids read the public topic alone
	const cardTopicReads = sentQueries.filter(({ text }) => text.includes('"topics"."id" in ('))
	const podcastEpisodeIdReads = sentQueries.filter(({ text }) => text.includes('"episodes"."topic_id" in ('))
	expect(cardTopicReads.map(({ values }) => values)).toEqual([["topic-public"]])
	expect(podcastEpisodeIdReads.every(({ values }) => !values.includes("topic-private"))).toBe(true)

	// the topic table still lists both topics
	const tableTopicRows = (topicTableRows.toTopicTableRows as ReturnType<typeof mock>).mock.calls[0]?.[0]
	expect(tableTopicRows.map((topicRow: { id: string }) => topicRow.id)).toEqual(["topic-public", "topic-private"])
})

test("a team with no ready film lists no film", async () => {
	stubTeamPage("member", [])
	expect(await loadFilmPodcastEpisodeIds("user-1")).toEqual([])
})

test("the Topic Posts read takes the topics' published posts, the pinned ones first, then the newest, with no limit", async () => {
	const sentQueries = stubTeamPage("member")
	await loadTeamPage("user-1", "team-1")

	// one read of the posts and one of their reactions, in the profile order
	const topicPostReads = sentQueries.filter(({ text }) => text.includes('from "topic_posts"'))
	expect(topicPostReads).toHaveLength(1)
	expect(topicPosts.toTopicPostCards).toHaveBeenCalledTimes(1)
	expect(topicPostReads[0]?.text).toContain('"topic_posts"."published_at" is not null')
	expect(topicPostReads[0]?.text).toContain('"topic_posts"."topic_id" in ($1, $2)')
	expect(topicPostReads[0]?.text).toContain(
		'order by "topic_posts"."profile_order" is null, "topic_posts"."profile_order" asc, "topic_posts"."published_at" desc',
	)
	expect(topicPostReads[0]?.text).not.toContain("limit")
})

test("a team page lists every published Topic Post of its topics, more than twelve, the pinned ones first", async () => {
	// fourteen pinned posts and six more on one topic, in the order the read returns them
	stubTeamPage("member")
	const topicPostRows = Array.from({ length: 20 }, (_, i) => ({
		topicPost: { id: `post-${i}`, topicId: "topic-public", profileOrder: i < 14 ? i + 1 : null },
	})) as TopicPostRow[]
	const loadRowsSpy = spyOn(topicPosts, "loadProfileOrderTopicPostRows").mockResolvedValue(topicPostRows)

	// the page holds all twenty in that order, from one read of the posts and one of their reactions
	const teamPageResult = await loadTeamPage("user-1", "team-1")
	const topicPostIds = teamPageResult.status === "visible" ? teamPageResult.team.topicPostCards.map(({ id }) => id) : []
	expect(topicPostIds).toEqual(topicPostRows.map(({ topicPost }) => topicPost.id))
	expect(loadRowsSpy).toHaveBeenCalledTimes(1)
	expect(topicPosts.toTopicPostCards).toHaveBeenCalledTimes(1)
})
