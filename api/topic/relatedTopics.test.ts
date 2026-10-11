// the related topics read: the other public shown topics nearest a topic's vector through the public and shown index
// in an iterative index scan, ranked once and cached in Redis, and for a user the topics they may open through their
// account scored without an index on every load, merged by score, each checked again, up to fifty, with every one's
// latest podcast episode read at once
import { expect, test } from "bun:test"
import { MINIMUM_SHOWN_FINDINGS } from "@shared/enums"
import { NO_SCRIPT_ROW_LIMIT } from "@shared/seo"
import { ITERATIVE_INDEX_SCAN_SETTING } from "../../db"
import { type SentQuery, stubConnectionPool } from "../../db/connectionPoolStub"
import { EMBED_MODEL_NAME } from "../../db/schema/scans"
import { toPublishedPodcastEpisodeRow } from "../podcast/podcastEpisodeTestFixtures"
import { MAX_RELATED_TOPIC_SCORE, RELATED_CANDIDATE_LIMIT } from "./relatedness"
import { EMBEDDING_CENTROID, stubRelatedReadsForEachTest } from "./relatednessTestFixtures"
import { loadRelatedTopics } from "./relatedTopics"

// the page's topic, and the signed-in user
const PAGE_TOPIC = { id: "topic-1" }
const USER_ID = "user-1"

// the count of findings no user rated down that a listed topic needs, as the view rules write it
const SHOWN_FINDING_COUNT_TEXT = `where "findings"."topic_id" = "topics"."id" and "findings"."rating" is distinct from 'down') >= $`

// one Redis with the centroid stored per test, and the connection pool and Redis put back after each
stubRelatedReadsForEachTest()

// the public related topics read, found by its candidates' name
function isPublicRelatedTopicsRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.startsWith('with "related_topic_candidates"')
}

// the user's own related topics read, found by the table it scores without candidates
function isAccessibleRelatedTopicsRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "topic_vectors" inner join "topics"') && !isPublicRelatedTopicsRead(sentQuery)
}

// the read of the ranked topics as they stand now, found by its id list
function isRelatedTopicRowsRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "topics" where ("topics"."id" in (')
}

// the scored rows of each related read, and the topics that the check keeps
type StubRelatedTopicReadsOptions = {
	publicScoreRows: unknown[][]
	accessibleScoreRows?: unknown[][]
	viewableTopicRows: unknown[][]
}

// stub the two related reads, the topics that the check keeps, and the latest episodes and their chapter counts
function stubRelatedTopicReads({
	publicScoreRows,
	accessibleScoreRows = [],
	viewableTopicRows,
}: StubRelatedTopicReadsOptions): SentQuery[] {
	return stubConnectionPool((sentQuery) => {
		// the scored ids of each read
		if (isPublicRelatedTopicsRead(sentQuery)) {
			return publicScoreRows
		}
		if (isAccessibleRelatedTopicsRead(sentQuery)) {
			return accessibleScoreRows
		}

		// the topics that the check keeps
		if (isRelatedTopicRowsRead(sentQuery)) {
			return viewableTopicRows
		}

		// a published episode with its chapter count for the first two topics
		if (sentQuery.text.includes('from "episode_chapters"')) {
			return [
				["episode-2", 15],
				["episode-3", 9],
			]
		}
		return sentQuery.text.includes('from "episodes"')
			? [toTopicPodcastEpisodeRow("episode-2", "topic-2"), toTopicPodcastEpisodeRow("episode-3", "topic-3")]
			: []
	})
}

// a published podcast episode row in the column order that the latest episode read selects
function toTopicPodcastEpisodeRow(podcastEpisodeId: string, topicId: string): unknown[] {
	return toPublishedPodcastEpisodeRow({ id: podcastEpisodeId, topicId, title: `Episode of ${topicId}` })
}

test("a visitor's read ranks the other public shown topics by their related score within its limit, up to fifty", async () => {
	const sentQueries = stubConnectionPool()
	await loadRelatedTopics(PAGE_TOPIC, null)

	// the iterative index scan is set before the read, inside the read's transaction
	const publicReadIndex = sentQueries.findIndex(isPublicRelatedTopicsRead)
	expect(sentQueries[publicReadIndex - 1]?.text).toBe(ITERATIVE_INDEX_SCAN_SETTING)

	// the candidates are other topics' current model vectors saved as public and shown, each topic checked again
	const publicRead = sentQueries[publicReadIndex] as SentQuery
	expect(publicRead.text).toContain('where ("topic_vectors"."is_public_and_shown" and')
	expect(publicRead.text).toContain('"topics"."visibility" = $')
	expect(publicRead.text).toContain(SHOWN_FINDING_COUNT_TEXT)
	expect(publicRead.text).toContain('"topic_vectors"."topic_id" <> $')
	expect(publicRead.text).toContain('exists (select "embedding" from "topic_vectors"')
	expect(publicRead.values).toContain(EMBED_MODEL_NAME)
	expect(publicRead.values).toContain(MINIMUM_SHOWN_FINDINGS)

	// the candidates are the nearest by plain cosine distance from the page's vector, through the index
	expect(publicRead.text).toContain('order by "topic_vectors"."embedding" <=> (select "embedding" from "topic_vectors"')
	expect(publicRead.values).toContain(RELATED_CANDIDATE_LIMIT)

	// each candidate is scored with the centroid taken out and its shared tags, kept within the limit, most related
	// first, up to fifty, with its id and score selected
	expect(publicRead.text).toContain('select "topic_id", ((("related_topic_candidates"."embedding" - $')
	expect(publicRead.text).toContain('from unnest("related_topic_candidates"."tags") as tag')
	expect(publicRead.values).toContain(JSON.stringify(EMBEDDING_CENTROID))
	expect(publicRead.values).toContain(MAX_RELATED_TOPIC_SCORE)
	expect(publicRead.values.at(-1)).toBe(NO_SCRIPT_ROW_LIMIT)

	// a visitor has no account to reach other topics through
	expect(sentQueries.filter(isAccessibleRelatedTopicsRead)).toHaveLength(0)
})

test("a user's read also scores the topics they may open through their account, without an index", async () => {
	const sentQueries = stubConnectionPool()
	await loadRelatedTopics(PAGE_TOPIC, USER_ID)

	// the user's read runs outside the iterative index scan, with no candidates to walk
	const accessibleReadIndex = sentQueries.findIndex(isAccessibleRelatedTopicsRead)
	const accessibleRead = sentQueries[accessibleReadIndex] as SentQuery
	expect(accessibleReadIndex).toBeGreaterThan(-1)
	expect(sentQueries[accessibleReadIndex - 1]?.text).not.toBe(ITERATIVE_INDEX_SCAN_SETTING)
	expect(accessibleRead.text).not.toContain("related_topic_candidates")

	// it keeps the topics the user owns, their teams' topics, and the invite topics they are invited to or subscribe to
	expect(accessibleRead.text).toContain('"topics"."owner_id" = $')
	expect(accessibleRead.text).toContain('from "team_members"')
	expect(accessibleRead.text).toContain('from "team_topics"')
	expect(accessibleRead.text).toContain('from "invites"')
	expect(accessibleRead.text).toContain('from "subscriptions"')
	expect(accessibleRead.values).toContain(USER_ID)

	// each is scored against the page's vector with the centroid taken out, kept within the limit, ordered by the score
	// itself, up to fifty
	expect(accessibleRead.text).toContain('"topic_vectors"."topic_id" <> $')
	expect(accessibleRead.text).toContain('("topic_vectors"."embedding" - $')
	expect(accessibleRead.text).toContain('from unnest("topics"."tags") as tag')
	expect(accessibleRead.text).not.toContain('order by "topic_vectors"."embedding" <=>')
	expect(accessibleRead.values).toContain(MAX_RELATED_TOPIC_SCORE)
	expect(accessibleRead.values.at(-1)).toBe(NO_SCRIPT_ROW_LIMIT)
})

test("the two reads merge by score, each topic once, and the check applies the user's view rules", async () => {
	// a private topic only the user may open ranks first, and the user's own public topic is in both reads
	const sentQueries = stubRelatedTopicReads({
		publicScoreRows: [
			["topic-2", 0.5],
			["topic-3", 0.6],
		],
		accessibleScoreRows: [
			["topic-5", 0.4],
			["topic-2", 0.5],
		],
		viewableTopicRows: [
			["topic-3", "Agents", "owner-3", "public"],
			["topic-2", "Robot vacuums", USER_ID, "public"],
			["topic-5", "Team roadmap", "owner-5", "private"],
		],
	})
	const relatedTopics = await loadRelatedTopics(PAGE_TOPIC, USER_ID)

	// the check keeps a public shown topic and a topic the user may open through their account
	const relatedTopicRowsRead = sentQueries.find(isRelatedTopicRowsRead) as SentQuery
	expect(relatedTopicRowsRead.text).toContain('"topics"."owner_id" = $')
	expect(relatedTopicRowsRead.text).toContain(SHOWN_FINDING_COUNT_TEXT)
	expect(relatedTopicRowsRead.values).toEqual(expect.arrayContaining(["topic-5", "topic-2", "topic-3"]))

	// the rows keep the merged order, most related first, with the shared topic once
	expect(relatedTopics.map((relatedTopic) => relatedTopic.id)).toEqual(["topic-5", "topic-2", "topic-3"])
})

test("every related topic's latest episode loads as a summary in one query, and a topic without one has none", async () => {
	// three ranked topics, each still public and shown, returned out of the ranked order
	const sentQueries = stubRelatedTopicReads({
		publicScoreRows: [
			["topic-2", 0.3],
			["topic-3", 0.4],
			["topic-4", 0.5],
		],
		viewableTopicRows: [
			["topic-4", "Espresso", "owner-4", "public"],
			["topic-2", "Robot vacuums", "owner-2", "public"],
			["topic-3", "Agents", "owner-3", "public"],
		],
	})
	const relatedTopics = await loadRelatedTopics(PAGE_TOPIC, null)

	// one latest episode read names all three topics
	const latestPodcastEpisodeReads = sentQueries.filter((sentQuery) => sentQuery.text.includes('from "episodes"'))
	expect(latestPodcastEpisodeReads).toHaveLength(1)
	expect(latestPodcastEpisodeReads[0]?.values).toEqual(expect.arrayContaining(["topic-2", "topic-3", "topic-4"]))

	// each episode comes as a summary with its chapter count, from one count and no chapter rows
	const chapterReads = sentQueries.filter((sentQuery) => sentQuery.text.includes('from "episode_chapters"'))
	expect(chapterReads).toHaveLength(1)
	expect(chapterReads[0]?.text).toContain("count(*)")

	// the rows keep the ranked order, and the topic with no published episode has none
	expect(relatedTopics.map((relatedTopic) => relatedTopic.name)).toEqual(["Robot vacuums", "Agents", "Espresso"])
	expect(relatedTopics.map((relatedTopic) => relatedTopic.latestPodcastEpisode?.chapterCount ?? null)).toEqual([
		15,
		9,
		null,
	])
})

test("the public ranking is cached and a user's is not, and a topic the user may no longer open drops out", async () => {
	// three ranked topics, of which the second is no longer one the user may open
	const sentQueries = stubRelatedTopicReads({
		publicScoreRows: [
			["topic-2", 0.3],
			["topic-3", 0.4],
			["topic-4", 0.5],
		],
		viewableTopicRows: [
			["topic-2", "Robot vacuums", "owner-2", "public"],
			["topic-4", "Espresso", "owner-4", "public"],
		],
	})

	// two page loads rank the public topics once, rank the user's own topics twice, and check the topics twice
	await loadRelatedTopics(PAGE_TOPIC, USER_ID)
	const relatedTopics = await loadRelatedTopics(PAGE_TOPIC, USER_ID)
	expect(sentQueries.filter(isPublicRelatedTopicsRead)).toHaveLength(1)
	expect(sentQueries.filter(isAccessibleRelatedTopicsRead)).toHaveLength(2)
	expect(sentQueries.filter(isRelatedTopicRowsRead)).toHaveLength(2)

	// the topic that dropped out is left out
	expect(relatedTopics.map((relatedTopic) => relatedTopic.id)).toEqual(["topic-2", "topic-4"])
})

test("a visitor's check keeps public shown topics alone, and a page with no related topics reads no topic rows", async () => {
	// a visitor's check is the public shown rule alone
	const visitorSentQueries = stubRelatedTopicReads({ publicScoreRows: [["topic-2", 0.3]], viewableTopicRows: [] })
	await loadRelatedTopics(PAGE_TOPIC, null)
	const visitorRowsRead = visitorSentQueries.find(isRelatedTopicRowsRead) as SentQuery
	expect(visitorRowsRead.text).toContain(SHOWN_FINDING_COUNT_TEXT)
	expect(visitorRowsRead.text).not.toContain('"topics"."owner_id"')

	// a page with no related topics reads no topic rows
	const sentQueries = stubRelatedTopicReads({ publicScoreRows: [], viewableTopicRows: [] })
	expect(await loadRelatedTopics({ id: "topic-6" }, USER_ID)).toEqual([])
	expect(sentQueries.filter(isRelatedTopicRowsRead)).toHaveLength(0)
})
