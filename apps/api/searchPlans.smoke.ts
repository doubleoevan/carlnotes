// a live smoke test for the name searches' trigram indexes, the topic ranking's plan, and the related reads' and the
// episode search's plans, against the dev database.
// run it with: bun run smoke:search-plans

import { type DbHandle, db, runWithIterativeIndexScan } from "@carlnotes/db"
import { EMBED_DIMENSIONS } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { podcastEpisodeVectors, topicVectors } from "@carlnotes/db/schema/vectors"
import { toRankTopicFindingsQuery } from "@carlnotes/pipeline/chat/retrieve"
import { sql } from "drizzle-orm"
import { toPodcastEpisodeViewFilter } from "./podcast/podcastEpisodeRows"
import {
	isPublicAndShownPodcastEpisodeVector,
	toMeaningMatchQuery,
	toTextMatchQuery,
} from "./podcast/podcastEpisodeSearch"
import {
	toAccessibleRelatedPodcastEpisodeScoresQuery,
	toPublicRelatedPodcastEpisodeScoresQuery,
	toTopicPodcastEpisodeRowsQuery,
} from "./podcast/relatedPodcastEpisodes"
import { toUserSearchQuery } from "./profiles"
import { toFindingSearchQuery } from "./search/findingSearch"
import { SEARCH_KIND_LIMIT } from "./search/search"
import { toTeamSearchQuery } from "./team/search"
import { loadEmbeddingCentroid } from "./topic/relatedness"
import { toAccessibleRelatedTopicScoresQuery, toPublicRelatedTopicScoresQuery } from "./topic/relatedTopics"
import { toTopicSearchQuery } from "./topic/search"

// a question vector of zeros, which ranks every finding the same and plans like any other
const ZERO_QUESTION_VECTOR = Array.from({ length: EMBED_DIMENSIONS }, () => 0)

// a search query's vector, a unit vector along the first dimension
const SEARCH_QUERY_VECTOR = ZERO_QUESTION_VECTOR.map((_, i) => (i === 0 ? 1 : 0))

// a planner switch a plan read turns off for its transaction. sequential scans off keeps a small table from hiding a
// missing index, plain index scans off makes an or over two indexes show its bitmap scans, and sorts off makes a ranked
// read order through its index
type PlannerSwitch = "enable_seqscan" | "enable_indexscan" | "enable_sort"

// the plan lines of a query, read inside one transaction with the planner switches turned off. a query built for a
// transaction gets that transaction, and the transaction has the iterative index scans a ranked read runs with
async function readPlan(toQuery: (handle: DbHandle) => unknown, plannerSwitches: PlannerSwitch[]): Promise<string> {
	return runWithIterativeIndexScan(async (transaction) => {
		// the switches stay off for this transaction alone
		for (const plannerSwitch of plannerSwitches) {
			await transaction.execute(sql.raw(`set local ${plannerSwitch} = off`))
		}

		// the plan's lines
		const { rows } = await transaction.execute(sql`explain ${toQuery(transaction) as never}`)
		return rows.map((row) => String(row["QUERY PLAN"])).join("\n")
	})
}

// fail the smoke with the plan if it is not the expected one
function assertPlan(planName: string, plan: string, isPlanExpected: boolean, expectedPlanDescription: string): void {
	if (!isPlanExpected) {
		throw new Error(`${planName}: expected ${expectedPlanDescription}\n${plan}`)
	}
	console.log(`${planName}: ok`)
}

// the topic ranking, on three real topics, never takes the HNSW index. an empty topics table plans nothing
const topicRows = await db.select({ id: topics.id }).from(topics).limit(3)
const topicIds = topicRows.map((topicRow) => topicRow.id)
if (topicIds.length === 0) {
	throw new Error("topic ranking: the database has no topics to plan against")
}
const topicRankingPlan = await readPlan(() => toRankTopicFindingsQuery(topicIds, ZERO_QUESTION_VECTOR, 8), [])
assertPlan(
	"topic ranking",
	topicRankingPlan,
	!topicRankingPlan.includes("resources_embedding_hnsw"),
	"no HNSW index scan",
)

// each name search reads its trigram index
const userSearchPlan = await readPlan(
	() => toUserSearchQuery({ normalizedUsername: "agent", limit: SEARCH_KIND_LIMIT }),
	["enable_seqscan"],
)
assertPlan(
	"username search",
	userSearchPlan,
	userSearchPlan.includes("users_username_normalized_trgm"),
	"a scan on users_username_normalized_trgm",
)
const teamSearchPlan = await readPlan(
	() => toTeamSearchQuery({ userId: null, query: "agent", limit: SEARCH_KIND_LIMIT }),
	["enable_seqscan"],
)
assertPlan(
	"team search",
	teamSearchPlan,
	teamSearchPlan.includes("teams_name_lower_trgm"),
	"a scan on teams_name_lower_trgm",
)
const topicSearchPlan = await readPlan(
	() => toTopicSearchQuery({ userId: null, query: "agent", isAdmin: false, limit: SEARCH_KIND_LIMIT }),
	["enable_seqscan"],
)
assertPlan(
	"topic search",
	topicSearchPlan,
	topicSearchPlan.includes("topics_name_lower_trgm"),
	"a scan on topics_name_lower_trgm",
)
const findingSearchPlan = await readPlan(
	() => toFindingSearchQuery({ userId: null, query: "agent", isAdmin: false, limit: SEARCH_KIND_LIMIT }),
	["enable_seqscan", "enable_indexscan"],
)
assertPlan(
	"finding search",
	findingSearchPlan,
	findingSearchPlan.includes("resources_title_or_url_lower_trgm"),
	"a scan on resources_title_or_url_lower_trgm",
)

// the episode search's text match reads both trigram indexes in one bitmap scan
const podcastEpisodeTextPlan = await readPlan(
	() => toTextMatchQuery({ query: "agent", viewFilter: toPodcastEpisodeViewFilter(null), limit: SEARCH_KIND_LIMIT }),
	["enable_seqscan", "enable_indexscan"],
)
assertPlan(
	"episode text search",
	podcastEpisodeTextPlan,
	podcastEpisodeTextPlan.includes("episodes_title_lower_trgm") &&
		podcastEpisodeTextPlan.includes("episodes_description_lower_trgm"),
	"scans on episodes_title_lower_trgm and episodes_description_lower_trgm",
)

// a real topic's vector and a real podcast episode's vector for the related reads to rank against
const [topicVectorRow] = await db.select({ topicId: topicVectors.topicId }).from(topicVectors).limit(1)
const [podcastEpisodeVectorRow] = await db
	.select({ podcastEpisodeId: podcastEpisodeVectors.podcastEpisodeId, topicId: podcastEpisodeVectors.topicId })
	.from(podcastEpisodeVectors)
	.limit(1)
if (!topicVectorRow || !podcastEpisodeVectorRow) {
	throw new Error("related reads: the database has no vectors to plan against. run scripts/backfill-vectors.ts")
}

// the average resource embedding that the related reads take out of every vector
const embeddingCentroid = await loadEmbeddingCentroid()
if (!embeddingCentroid) {
	throw new Error("related reads: the database has no embedded resources to average")
}

// each ranked read orders through its HNSW index, with sorts off as well. the public related reads and a visitor's
// meaning match rank through the public and shown indexes, and a user's meaning match through the index of every
// episode vector
const rankedPlans = [
	{
		planName: "related topics",
		indexName: "topic_vectors_public_and_shown_embedding_hnsw",
		toQuery: (handle: DbHandle) =>
			toPublicRelatedTopicScoresQuery(handle, { topicId: topicVectorRow.topicId, embeddingCentroid }),
	},
	{
		planName: "related episodes",
		indexName: "episode_vectors_public_and_shown_embedding_hnsw",
		toQuery: (handle: DbHandle) =>
			toPublicRelatedPodcastEpisodeScoresQuery(handle, { ...podcastEpisodeVectorRow, embeddingCentroid }),
	},
	{
		planName: "visitor episode meaning search",
		indexName: "episode_vectors_public_and_shown_embedding_hnsw",
		toQuery: (handle: DbHandle) =>
			toMeaningMatchQuery(handle, {
				queryVector: SEARCH_QUERY_VECTOR,
				viewFilter: toPodcastEpisodeViewFilter(null, isPublicAndShownPodcastEpisodeVector),
				textMatchIds: [],
				limit: 5,
			}),
	},
	{
		planName: "user episode meaning search",
		indexName: "episode_vectors_embedding_hnsw",
		toQuery: (handle: DbHandle) =>
			toMeaningMatchQuery(handle, {
				queryVector: SEARCH_QUERY_VECTOR,
				viewFilter: toPodcastEpisodeViewFilter("plan-check-user", isPublicAndShownPodcastEpisodeVector),
				textMatchIds: [],
				limit: 5,
			}),
	},
]
for (const { planName, indexName, toQuery } of rankedPlans) {
	const rankedPlan = await readPlan(toQuery, ["enable_seqscan", "enable_sort"])
	assertPlan(planName, rankedPlan, rankedPlan.includes(indexName), `an index scan on ${indexName}`)
}

// a user's own related reads score every vector they may open without an HNSW index, which would stop at its first
// candidates outside an iterative scan
const accessiblePlans = [
	{
		planName: "accessible related topics",
		toQuery: (handle: DbHandle) =>
			toAccessibleRelatedTopicScoresQuery(handle, {
				topicId: topicVectorRow.topicId,
				userId: "plan-check-user",
				embeddingCentroid,
			}),
	},
	{
		planName: "accessible related episodes",
		toQuery: (handle: DbHandle) =>
			toAccessibleRelatedPodcastEpisodeScoresQuery(handle, {
				...podcastEpisodeVectorRow,
				userId: "plan-check-user",
				embeddingCentroid,
			}),
	},
]
for (const { planName, toQuery } of accessiblePlans) {
	const accessiblePlan = await readPlan(toQuery, [])
	assertPlan(planName, accessiblePlan, !accessiblePlan.includes("_embedding_hnsw"), "no HNSW index scan")
}

// the topic's other podcast episodes read newest first through the topic's published index
const topicPodcastEpisodesPlan = await readPlan(
	(handle) => toTopicPodcastEpisodeRowsQuery(handle, podcastEpisodeVectorRow),
	["enable_seqscan", "enable_sort"],
)
assertPlan(
	"other episodes",
	topicPodcastEpisodesPlan,
	topicPodcastEpisodesPlan.includes("episodes_topic_published_idx"),
	"an index scan on episodes_topic_published_idx",
)
process.exit(0)
