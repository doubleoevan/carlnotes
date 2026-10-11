// what makes a topic or a published podcast episode related to a page's: the cosine distance between their vectors once
// the embedding model's average resource embedding is taken out of both, nearer for each tag their topics share, and no
// farther than a fixed limit. the public shown ones are ranked once for everyone, and the ones a user may open through
// their account are ranked for that user alone
import { NO_SCRIPT_ROW_LIMIT } from "@shared/seo"
import { type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { type DbTransaction, db, isCurrentModelEmbedding, runWithIterativeIndexScan } from "../../db"
import { cacheJson } from "../../db/redis"
import { EMBED_MODEL_NAME, resources } from "../../db/schema/scans"
import { topics } from "../../db/schema/topics"

// how long Redis keeps a topic's or a podcast episode's public related ids and their scores
const RELATED_SCORES_TTL_MS = 15 * 60 * 1000

// how many of the nearest vectors by their plain cosine distance a related read scores, ranked through the HNSW index
export const RELATED_CANDIDATE_LIMIT = 200

// the highest score a related topic may have, and the highest a related podcast episode may have
export const MAX_RELATED_TOPIC_SCORE = 0.75
export const MAX_RELATED_PODCAST_EPISODE_SCORE = 0.75

// how much nearer each tag the two topics share brings a candidate, counting up to two tags
const SHARED_TAG_SCORE_BONUS = 0.1
const MAX_COUNTED_SHARED_TAGS = 2

// how long Redis keeps the average resource embedding, and how many resources it averages
const EMBEDDING_CENTROID_TTL_MS = 24 * 60 * 60 * 1000
const EMBEDDING_CENTROID_RESOURCE_LIMIT = 20_000

// the Redis key of the current embedding model's average resource embedding
export const EMBEDDING_CENTROID_KEY = `embedding-centroid:${EMBED_MODEL_NAME}`

// one related topic's or podcast episode's id and its related score
type RelatedScoreRow = { id: string; relatedScore: number }

// the page's Redis key for its public ranking, the public ranking query, and the user's own ranking query if signed in
type LoadRelatedIdsOptions = {
	cacheKey: string
	toPublicRelatedScoresQuery: (
		transaction: DbTransaction,
		embeddingCentroid: number[],
	) => PromiseLike<RelatedScoreRow[]>
	toAccessibleRelatedScoresQuery?: (embeddingCentroid: number[]) => PromiseLike<RelatedScoreRow[]>
}

/**
 * Loads a page's related ids, most related first, up to fifty: the public ranking, from Redis or ranked once per cache
 * lifetime, merged by score with the user's own ranking, which is never cached. None with no centroid.
 */
export async function loadRelatedIds({
	cacheKey,
	toPublicRelatedScoresQuery,
	toAccessibleRelatedScoresQuery,
}: LoadRelatedIdsOptions): Promise<string[]> {
	// no ranking without a centroid
	const embeddingCentroid = await loadEmbeddingCentroid()
	if (!embeddingCentroid) {
		return []
	}

	// the public ranking, the same for everyone, and the user's own ranking, scored for them alone
	const publicRelatedScoreRows = await cacheJson({
		key: cacheKey,
		ttlMs: RELATED_SCORES_TTL_MS,
		load: () =>
			runWithIterativeIndexScan(async (transaction) => toPublicRelatedScoresQuery(transaction, embeddingCentroid)),
	})
	const accessibleRelatedScoreRows = toAccessibleRelatedScoresQuery
		? await toAccessibleRelatedScoresQuery(embeddingCentroid)
		: []
	return toMergedRelatedIds([...publicRelatedScoreRows, ...accessibleRelatedScoreRows])
}

/**
 * Returns the ids of the scored rows, each id once at its lowest score, most related first, up to fifty.
 */
export function toMergedRelatedIds(relatedScoreRows: RelatedScoreRow[]): string[] {
	// the most related first, so each id's first row has its lowest score
	const rankedRelatedScoreRows = relatedScoreRows.toSorted(
		(firstRow, secondRow) => firstRow.relatedScore - secondRow.relatedScore,
	)
	const rankedRelatedIds = new Set(rankedRelatedScoreRows.map((relatedScoreRow) => relatedScoreRow.id))
	return [...rankedRelatedIds].slice(0, NO_SCRIPT_ROW_LIMIT)
}

/**
 * Loads the current embedding model's average resource embedding over up to twenty thousand resources, from Redis or
 * the database, or null with no embedded resource, which it never stores.
 */
export async function loadEmbeddingCentroid(): Promise<number[] | null> {
	return cacheJson({
		key: EMBEDDING_CENTROID_KEY,
		ttlMs: EMBEDDING_CENTROID_TTL_MS,
		load: async () => {
			// a bounded sample of the current model's resource embeddings
			const sampledEmbeddings = db
				.select({ embedding: resources.embedding })
				.from(resources)
				.where(isCurrentModelEmbedding)
				.limit(EMBEDDING_CENTROID_RESOURCE_LIMIT)
				.as("sampled_embeddings")

			// average the sample
			const [embeddingCentroidRow] = await db
				.select({ embedding: sql<number[] | null>`avg(${sampledEmbeddings.embedding})`.mapWith(resources.embedding) })
				.from(sampledEmbeddings)
			return embeddingCentroidRow?.embedding ?? null
		},
		isStorable: (embeddingCentroid) => embeddingCentroid !== null,
	})
}

// the vectors and tags a related score compares: the candidate's and the page's vector, the centroid to take out of
// both, the candidate's topic tags, and the page's topic, whose tags are read by its id
type ToRelatedScoreOptions = {
	candidateEmbedding: SQLWrapper
	pageEmbedding: SQLWrapper
	embeddingCentroid: number[]
	candidateTags: SQLWrapper
	pageTopicId: string
}

/**
 * Returns a related candidate's score in SQL: the cosine distance between its vector and the page's, each with the
 * centroid taken out, less a bonus for each tag their topics share. A lower score is more related.
 */
export function toRelatedScore({
	candidateEmbedding,
	pageEmbedding,
	embeddingCentroid,
	candidateTags,
	pageTopicId,
}: ToRelatedScoreOptions): SQL<number> {
	// the cosine distance with the centroid taken out of both vectors
	const centroidVector = sql`${JSON.stringify(embeddingCentroid)}::vector`
	const centeredDistance = sql`((${candidateEmbedding} - ${centroidVector}) <=> (${pageEmbedding} - ${centroidVector}))`

	// the bonus for the tags both topics have, compared lowercased with everything but letters and digits left out
	const pageTags = sql`(select ${topics.tags} from ${topics} where ${topics.id} = ${pageTopicId})`
	const sharedTagCount = sql`(select count(distinct ${toTagKey(sql`tag`)}) from unnest(${candidateTags}) as tag where ${toTagKey(sql`tag`)} <> '' and ${toTagKey(sql`tag`)} in (select ${toTagKey(sql`page_tag`)} from unnest(${pageTags}) as page_tag))`
	const sharedTagBonus = sql`${SHARED_TAG_SCORE_BONUS}::float8 * least(${sharedTagCount}, ${MAX_COUNTED_SHARED_TAGS}::bigint)`
	return sql<number>`(${centeredDistance} - ${sharedTagBonus})`
}

/**
 * Returns the rows in the order of their ids, leaving out an id with no row.
 */
export function toRowsInIdOrder<Row>(ids: string[], rows: Row[], toRowId: (row: Row) => string): Row[] {
	const rowById = new Map(rows.map((row) => [toRowId(row), row]))
	return ids.flatMap((id) => rowById.get(id) ?? [])
}

// a tag as two topics compare it: lowercased, with everything but letters and digits left out, so "AI & Engineering"
// and "ai-engineering" match
function toTagKey(tag: SQL): SQL {
	return sql`regexp_replace(lower(${tag}), '[^[:alnum:]]', '', 'g')`
}
