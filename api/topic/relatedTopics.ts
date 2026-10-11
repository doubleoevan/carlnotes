// the "Similar topics" table on a topic's page: the other public shown topics most related to it, and for a user the
// topics they may open through their account
import type { TopicResponse } from "@shared/contracts/topics"
import { NO_SCRIPT_ROW_LIMIT } from "@shared/seo"
import { and, eq, exists, inArray, lte, ne, sql } from "drizzle-orm"
import { type DbHandle, db, isPublicAndShown } from "../../db"
import { EMBED_MODEL_NAME } from "../../db/schema/scans"
import { topics } from "../../db/schema/topics"
import { topicVectors } from "../../db/schema/vectors"
import { loadLatestPodcastEpisodeSummaries } from "../podcast/podcastEpisodeShapes"
import { toTopicAccessFilter, toTopicViewFilter } from "./permissions"
import {
	loadRelatedIds,
	MAX_RELATED_TOPIC_SCORE,
	RELATED_CANDIDATE_LIMIT,
	toRelatedScore,
	toRowsInIdOrder,
} from "./relatedness"

// the page's topic
type RelatedTopicsPageTopic = Pick<typeof topics.$inferSelect, "id">

/**
 * Loads the up to fifty other topics most related to a topic that the user may open, each with its latest podcast
 * episode that the user may listen to.
 */
export async function loadRelatedTopics(
	topic: RelatedTopicsPageTopic,
	userId: string | null,
): Promise<TopicResponse["relatedTopics"]> {
	// the most related public shown topics, and the ones the user may open through their account
	const relatedTopicIds = await loadRelatedIds({
		cacheKey: `related-topic-scores:${topic.id}`,
		toPublicRelatedScoresQuery: (transaction, embeddingCentroid) =>
			toPublicRelatedTopicScoresQuery(transaction, { topicId: topic.id, embeddingCentroid }),
		toAccessibleRelatedScoresQuery: userId
			? (embeddingCentroid) => toAccessibleRelatedTopicScoresQuery(db, { topicId: topic.id, userId, embeddingCentroid })
			: undefined,
	})
	if (relatedTopicIds.length === 0) {
		return []
	}

	// the topics as they stand now, each one the user may still open, in the ranked order
	const relatedTopicRows = await db
		.select({ id: topics.id, name: topics.name, ownerId: topics.ownerId, visibility: topics.visibility })
		.from(topics)
		.where(and(inArray(topics.id, relatedTopicIds), toTopicViewFilter(userId)))
	const rankedRelatedTopicRows = toRowsInIdOrder(
		relatedTopicIds,
		relatedTopicRows,
		(relatedTopicRow) => relatedTopicRow.id,
	)

	// every related topic's latest podcast episode in one read
	const latestPodcastEpisodeByTopicId = await loadLatestPodcastEpisodeSummaries(rankedRelatedTopicRows, userId)
	return rankedRelatedTopicRows.map((relatedTopicRow) => ({
		id: relatedTopicRow.id,
		name: relatedTopicRow.name,
		latestPodcastEpisode: latestPodcastEpisodeByTopicId.get(relatedTopicRow.id) ?? null,
	}))
}

// the page's topic, and the average resource embedding that the read takes out of every vector
type ToPublicRelatedTopicScoresQueryOptions = { topicId: string; embeddingCentroid: number[] }

/**
 * Returns the public related topics read: the other public shown topics with a current model vector nearest the
 * topic's through the public and shown HNSW index, with their related scores, kept within the limit, most related
 * first. None at all unless the topic has a vector of its own.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toPublicRelatedTopicScoresQuery(
	handle: DbHandle,
	{ topicId, embeddingCentroid }: ToPublicRelatedTopicScoresQueryOptions,
) {
	// the topic's own current model vector, which orders the candidates
	const topicVectorQuery = toTopicVectorQuery(handle, topicId)

	// the other public shown topics' vectors nearest by their plain cosine distance, through the public and shown index.
	// each topic is checked again in case its saved flag is out of date
	const relatedTopicCandidates = handle.$with("related_topic_candidates").as(
		handle
			.select({ topicId: topicVectors.topicId, embedding: topicVectors.embedding, tags: topics.tags })
			.from(topicVectors)
			.innerJoin(topics, eq(topicVectors.topicId, topics.id))
			.where(
				and(
					sql`${topicVectors.isPublicAndShown}`,
					isPublicAndShown,
					ne(topicVectors.topicId, topicId),
					eq(topicVectors.embeddingModel, EMBED_MODEL_NAME),
					exists(topicVectorQuery),
				),
			)
			.orderBy(sql`${topicVectors.embedding} <=> ${topicVectorQuery}`)
			.limit(RELATED_CANDIDATE_LIMIT),
	)

	// each candidate's score
	const relatedScore = toRelatedScore({
		candidateEmbedding: relatedTopicCandidates.embedding,
		pageEmbedding: topicVectorQuery,
		embeddingCentroid,
		candidateTags: relatedTopicCandidates.tags,
		pageTopicId: topicId,
	})

	// the candidates within the score's limit, most related first
	return handle
		.with(relatedTopicCandidates)
		.select({ id: relatedTopicCandidates.topicId, relatedScore: relatedScore.mapWith(Number) })
		.from(relatedTopicCandidates)
		.where(lte(relatedScore, MAX_RELATED_TOPIC_SCORE))
		.orderBy(relatedScore)
		.limit(NO_SCRIPT_ROW_LIMIT)
}

// the page's topic, the user, and the average resource embedding that the read takes out of every vector
type ToAccessibleRelatedTopicScoresQueryOptions = { topicId: string; userId: string; embeddingCentroid: number[] }

/**
 * Returns the accessible related topics read: the other topics the user may open through their account, each with a
 * current model vector, scored against the topic's vector without an index, kept within the limit, most related first.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toAccessibleRelatedTopicScoresQuery(
	handle: DbHandle,
	{ topicId, userId, embeddingCentroid }: ToAccessibleRelatedTopicScoresQueryOptions,
) {
	// each accessible topic's score against the topic's own vector. with no vector of the topic's own, every score is
	// null and no topic is kept
	const relatedScore = toRelatedScore({
		candidateEmbedding: topicVectors.embedding,
		pageEmbedding: toTopicVectorQuery(handle, topicId),
		embeddingCentroid,
		candidateTags: topics.tags,
		pageTopicId: topicId,
	})

	// the accessible topics within the score's limit, most related first
	return handle
		.select({ id: topicVectors.topicId, relatedScore: relatedScore.mapWith(Number) })
		.from(topicVectors)
		.innerJoin(topics, eq(topicVectors.topicId, topics.id))
		.where(
			and(
				toTopicAccessFilter(userId),
				ne(topicVectors.topicId, topicId),
				eq(topicVectors.embeddingModel, EMBED_MODEL_NAME),
				lte(relatedScore, MAX_RELATED_TOPIC_SCORE),
			),
		)
		.orderBy(relatedScore)
		.limit(NO_SCRIPT_ROW_LIMIT)
}

// the topic's own current model vector
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
function toTopicVectorQuery(handle: DbHandle, topicId: string) {
	return handle
		.select({ embedding: topicVectors.embedding })
		.from(topicVectors)
		.where(and(eq(topicVectors.topicId, topicId), eq(topicVectors.embeddingModel, EMBED_MODEL_NAME)))
}
