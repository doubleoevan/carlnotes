// the episode page's two table reads: the topic's other published podcast episodes that the user may listen to newest
// first, and the published podcast episodes of other topics most related to the page's episode within the score's
// limit, the public shown ones ranked once and cached in Redis and a user's own scored on every load, merged by score
// and each checked again, each table up to fifty
import { expect, test } from "bun:test"
import { NO_SCRIPT_ROW_LIMIT } from "@shared/seo"
import { ITERATIVE_INDEX_SCAN_SETTING } from "../../db"
import { type SentQuery, stubConnectionPool } from "../../db/connectionPoolStub"
import { EMBED_MODEL_NAME } from "../../db/schema/scans"
import { MAX_RELATED_PODCAST_EPISODE_SCORE, RELATED_CANDIDATE_LIMIT } from "../topic/relatedness"
import { EMBEDDING_CENTROID, stubRelatedReadsForEachTest } from "../topic/relatednessTestFixtures"
import type { TopicRow } from "./podcastEpisodeRows"
import { toPublishedPodcastEpisodeRow } from "./podcastEpisodeTestFixtures"
import { loadRelatedPodcastEpisodeRows, loadTopicPodcastEpisodeRows } from "./relatedPodcastEpisodes"

// the page's public topic and an invite topic, the page's podcast episode, and the signed-in user
const PUBLIC_TOPIC = {
	id: "topic-1",
	name: "Agents",
	visibility: "public",
	ownerId: "owner-1",
	teamId: null,
} as TopicRow
const INVITE_TOPIC = { ...PUBLIC_TOPIC, visibility: "invite" } as TopicRow
const PODCAST_EPISODE_ID = "episode-1"
const USER_ID = "user-1"

// when the user's subscription to the invite topic activated
const SUBSCRIBER_ACTIVATED_AT = "2026-10-01T00:00:00.000Z"

// one Redis with the centroid stored per test, and the connection pool and Redis put back after each
stubRelatedReadsForEachTest()

// the public related podcast episodes read, found by its candidates' name
function isPublicRelatedPodcastEpisodesRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.startsWith('with "related_episode_candidates"')
}

// the user's own related podcast episodes read, found by the table it scores without candidates
function isAccessibleRelatedPodcastEpisodesRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "episode_vectors" inner join "episodes"')
}

// the read of the ranked podcast episodes as they stand now, found by its id list
function isRelatedPodcastEpisodeRowsRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('where ("episodes"."id" in (')
}

// a related podcast episode as the check reads it: its columns with a description, then its topic's
function toRelatedPodcastEpisodeRow(podcastEpisodeId: string, title: string): unknown[] {
	const podcastEpisodeFields = { id: podcastEpisodeId, topicId: "topic-2", title, description: `About ${title}` }
	return [...toPublishedPodcastEpisodeRow(podcastEpisodeFields), "topic-2", "Robot vacuums", "public"]
}

test("the topic's other published podcast episodes are read newest first, up to fifty, with their descriptions", async () => {
	const sentQueries = stubConnectionPool()
	await loadTopicPodcastEpisodeRows({ podcastEpisodeId: PODCAST_EPISODE_ID, topic: PUBLIC_TOPIC })

	// one read of the topic's published podcast episodes but the page's own, through the topic's published index
	const [topicPodcastEpisodesRead] = sentQueries
	expect(sentQueries).toHaveLength(1)
	expect(topicPodcastEpisodesRead?.text).toContain('"title", "description"')
	expect(topicPodcastEpisodesRead?.text).toContain(
		'where (("episodes"."topic_id" = $1 and "episodes"."status" = $2) and "episodes"."id" <> $3)',
	)
	expect(topicPodcastEpisodesRead?.text).toContain('order by "episodes"."published_at" desc limit $4')
	expect(topicPodcastEpisodesRead?.values).toEqual(["topic-1", "published", "episode-1", NO_SCRIPT_ROW_LIMIT])
})

test("an invite topic's other episodes are the ones published after the user's subscription activated", async () => {
	const sentQueries = stubConnectionPool()
	await loadTopicPodcastEpisodeRows({
		podcastEpisodeId: PODCAST_EPISODE_ID,
		topic: INVITE_TOPIC,
		subscriberActivatedAt: new Date(SUBSCRIBER_ACTIVATED_AT),
	})

	// the episodes read keeps the ones published after the activation
	const [topicPodcastEpisodesRead] = sentQueries
	expect(sentQueries).toHaveLength(1)
	expect(topicPodcastEpisodesRead?.text).toContain('"episodes"."published_at" > $3')
	expect(topicPodcastEpisodesRead?.values).toContainEqual(new Date(SUBSCRIBER_ACTIVATED_AT).toISOString())
})

test("the public related podcast episodes are other topics' public and shown episode vectors, scored within the limit", async () => {
	const sentQueries = stubConnectionPool()
	await loadRelatedPodcastEpisodeRows({ podcastEpisodeId: PODCAST_EPISODE_ID, topic: PUBLIC_TOPIC, userId: null })

	// the iterative index scan is set before the read, inside the read's transaction
	const publicReadIndex = sentQueries.findIndex(isPublicRelatedPodcastEpisodesRead)
	expect(sentQueries[publicReadIndex - 1]?.text).toBe(ITERATIVE_INDEX_SCAN_SETTING)

	// the candidates are other topics' current model vectors saved as public and shown, with no join to check a topic,
	// the nearest by plain cosine distance through the index
	const publicRead = sentQueries[publicReadIndex] as SentQuery
	const candidatesText = publicRead.text.split(" select ")[0] ?? ""
	expect(publicRead.text).toContain('where ("episode_vectors"."is_topic_public_and_shown" and')
	expect(publicRead.text).toContain('"episode_vectors"."topic_id" <> $')
	expect(publicRead.text).toContain('exists (select "embedding" from "episode_vectors"')
	expect(candidatesText).not.toContain("join")
	expect(publicRead.text).toContain('order by "episode_vectors"."embedding" <=> (select "embedding" from')
	expect(publicRead.values).toEqual(expect.arrayContaining(["topic-1", EMBED_MODEL_NAME, RELATED_CANDIDATE_LIMIT]))

	// each candidate is scored with the centroid taken out and its topic's shared tags, kept within the limit, most
	// related first, up to fifty, with its id and score selected
	expect(publicRead.text).toContain(
		'select "related_episode_candidates"."episode_id", ((("related_episode_candidates"."embedding" - $',
	)
	expect(publicRead.text).toContain('inner join "topics" on "related_episode_candidates"."topic_id" = "topics"."id"')
	expect(publicRead.text).toContain('from unnest("topics"."tags") as tag')
	expect(publicRead.values).toContain(JSON.stringify(EMBEDDING_CENTROID))
	expect(publicRead.values).toContain(MAX_RELATED_PODCAST_EPISODE_SCORE)

	// each candidate's topic is checked again before the ranking is cached, so an out-of-date flag never reaches it
	const scoredText = publicRead.text.split(' from "related_episode_candidates" ')[1] ?? ""
	expect(scoredText).toContain('"topics"."visibility" = $')
	expect(scoredText).toContain(`"findings"."rating" is distinct from 'down') >= $`)
	expect(publicRead.values.at(-1)).toBe(NO_SCRIPT_ROW_LIMIT)

	// a visitor has no account to reach other episodes through
	expect(sentQueries.filter(isAccessibleRelatedPodcastEpisodesRead)).toHaveLength(0)
})

test("a user's read also scores the published episodes they may listen to through their account, without an index", async () => {
	const sentQueries = stubConnectionPool()
	await loadRelatedPodcastEpisodeRows({ podcastEpisodeId: PODCAST_EPISODE_ID, topic: INVITE_TOPIC, userId: USER_ID })

	// the user's read runs outside the iterative index scan, with no candidates to walk
	const accessibleReadIndex = sentQueries.findIndex(isAccessibleRelatedPodcastEpisodesRead)
	const accessibleRead = sentQueries[accessibleReadIndex] as SentQuery
	expect(accessibleReadIndex).toBeGreaterThan(-1)
	expect(sentQueries[accessibleReadIndex - 1]?.text).not.toBe(ITERATIVE_INDEX_SCAN_SETTING)
	expect(accessibleRead.text).not.toContain("related_episode_candidates")

	// it keeps the episodes of topics the user has a role on, and an invite topic's episodes published after the
	// user's subscription activated
	expect(accessibleRead.text).toContain('"topics"."owner_id" = $')
	expect(accessibleRead.text).toContain('from "team_members"')
	expect(accessibleRead.text).toContain('"episodes"."published_at" > "subscriptions"."created_at"')
	expect(accessibleRead.values).toContain(USER_ID)

	// each published episode of another topic is scored against the page's episode vector, kept within the limit,
	// ordered by the score itself, up to fifty
	expect(accessibleRead.text).toContain('"episodes"."status" = $')
	expect(accessibleRead.text).toContain('"episodes"."topic_id" <> $')
	expect(accessibleRead.text).toContain('("episode_vectors"."embedding" - $')
	expect(accessibleRead.text).not.toContain('order by "episode_vectors"."embedding" <=>')
	expect(accessibleRead.values).toContain(MAX_RELATED_PODCAST_EPISODE_SCORE)
	expect(accessibleRead.values.at(-1)).toBe(NO_SCRIPT_ROW_LIMIT)
})

test("a related podcast episode comes back in the merged order with its description, checked again on each read", async () => {
	// two public ranked episodes and a third no longer listed, and a user's own episode that ranks between them
	const sentQueries = stubConnectionPool((sentQuery) => {
		if (isPublicRelatedPodcastEpisodesRead(sentQuery)) {
			return [
				["episode-2", 0.3],
				["episode-3", 0.5],
				["episode-4", 0.6],
			]
		}
		if (isAccessibleRelatedPodcastEpisodesRead(sentQuery)) {
			return [["episode-5", 0.4]]
		}
		return isRelatedPodcastEpisodeRowsRead(sentQuery)
			? [
					toRelatedPodcastEpisodeRow("episode-3", "Mops, ranked"),
					toRelatedPodcastEpisodeRow("episode-5", "Team standup, ranked"),
					toRelatedPodcastEpisodeRow("episode-2", "Robot vacuums, ranked"),
				]
			: []
	})

	// two page loads rank the public episodes once, rank the user's own twice, and check the episodes twice
	const loadRelatedPodcastEpisodeRowsOptions = {
		podcastEpisodeId: PODCAST_EPISODE_ID,
		topic: PUBLIC_TOPIC,
		userId: USER_ID,
	}
	await loadRelatedPodcastEpisodeRows(loadRelatedPodcastEpisodeRowsOptions)
	const relatedPodcastEpisodeRows = await loadRelatedPodcastEpisodeRows(loadRelatedPodcastEpisodeRowsOptions)
	expect(sentQueries.filter(isPublicRelatedPodcastEpisodesRead)).toHaveLength(1)
	expect(sentQueries.filter(isAccessibleRelatedPodcastEpisodesRead)).toHaveLength(2)
	expect(sentQueries.filter(isRelatedPodcastEpisodeRowsRead)).toHaveLength(2)

	// the check keeps each episode published on another topic that the user may listen to, and reads its description
	const relatedPodcastEpisodeRowsRead = sentQueries.find(isRelatedPodcastEpisodeRowsRead) as SentQuery
	expect(relatedPodcastEpisodeRowsRead.text).toContain('"episodes"."status" = $')
	expect(relatedPodcastEpisodeRowsRead.text).toContain('"episodes"."topic_id" <> $')
	expect(relatedPodcastEpisodeRowsRead.text).toContain('"topics"."visibility" = $')
	expect(relatedPodcastEpisodeRowsRead.text).toContain('"topics"."owner_id" = $')
	expect(relatedPodcastEpisodeRowsRead.text.split(" from ")[0]).toContain("description")

	// the rows keep the merged order, the episode no longer listed is left out, and each has its description
	expect(relatedPodcastEpisodeRows.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)).toEqual([
		"episode-2",
		"episode-5",
		"episode-3",
	])
	expect(relatedPodcastEpisodeRows[0]?.podcastEpisodeRow.description).toBe("About Robot vacuums, ranked")
	expect(relatedPodcastEpisodeRows[0]?.topic).toEqual({ id: "topic-2", name: "Robot vacuums", visibility: "public" })
})
