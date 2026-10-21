// the rows of the two tables at the end of a podcast episode's page: the topic's other published podcast episodes the
// user may listen to, and the most related published podcast episodes of other topics, the public shown ones and the
// ones the user may listen to through their account
import { NO_SCRIPT_ROW_LIMIT } from "@carlnotes/contracts/seo"
import { type DbHandle, db, isPublicAndShown } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { podcastEpisodeVectors } from "@carlnotes/db/schema/vectors"
import { and, desc, eq, exists, inArray, lte, ne, sql } from "drizzle-orm"
import {
	loadRelatedIds,
	MAX_RELATED_PODCAST_EPISODE_SCORE,
	RELATED_CANDIDATE_LIMIT,
	toRelatedScore,
	toRowsInIdOrder,
} from "../topic/relatedness"
import {
	type PodcastEpisodeTopic,
	podcastEpisodeColumns,
	toListenableTopicPodcastEpisodeFilter,
	toPodcastEpisodeAccessFilter,
	toPodcastEpisodeViewFilter,
} from "./podcastEpisodeRows"
import type { PodcastEpisodeRowTopic } from "./podcastEpisodeShapes"

// the page's podcast episode, its topic, and when the user's subscription activated if a gate applies
type LoadTopicPodcastEpisodeRowsOptions = {
	podcastEpisodeId: string
	topic: PodcastEpisodeTopic
	subscriberActivatedAt?: Date
}

/**
 * Loads a topic's other published podcast episodes that the user may listen to, newest first, up to fifty.
 */
export async function loadTopicPodcastEpisodeRows({
	podcastEpisodeId,
	topic,
	subscriberActivatedAt,
}: LoadTopicPodcastEpisodeRowsOptions): Promise<PodcastEpisodeRowTopic[]> {
	// the topic's other episodes, published after the user's subscription activated if a gate applies
	const podcastEpisodeRows = await toTopicPodcastEpisodeRowsQuery(db, {
		podcastEpisodeId,
		topicId: topic.id,
		subscriberActivatedAt,
	})
	return podcastEpisodeRows.map((podcastEpisodeRow) => ({ podcastEpisodeRow, topic }))
}

// the page's podcast episode and its topic, and when the user's subscription activated if a gate applies
type ToTopicPodcastEpisodeRowsQueryOptions = {
	podcastEpisodeId: string
	topicId: string
	subscriberActivatedAt?: Date
}

/**
 * Returns the topic's other podcast episodes read: its published podcast episodes except the page's own, after the
 * user's subscription activated if a gate applies, newest first through the topic's published index, up to fifty.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toTopicPodcastEpisodeRowsQuery(
	handle: DbHandle,
	{ podcastEpisodeId, topicId, subscriberActivatedAt }: ToTopicPodcastEpisodeRowsQueryOptions,
) {
	return handle
		.select(podcastEpisodeColumns)
		.from(podcastEpisodes)
		.where(
			and(
				toListenableTopicPodcastEpisodeFilter({ topicId, subscriberActivatedAt }),
				ne(podcastEpisodes.id, podcastEpisodeId),
			),
		)
		.orderBy(desc(podcastEpisodes.publishedAt))
		.limit(NO_SCRIPT_ROW_LIMIT)
}

// the page's podcast episode and its topic, and the user, null for a visitor
type LoadRelatedPodcastEpisodeRowsOptions = {
	podcastEpisodeId: string
	topic: PodcastEpisodeTopic
	userId: string | null
}

/**
 * Loads the up to fifty published podcast episodes of other topics most related to a podcast episode that the user may
 * listen to.
 */
export async function loadRelatedPodcastEpisodeRows({
	podcastEpisodeId,
	topic,
	userId,
}: LoadRelatedPodcastEpisodeRowsOptions): Promise<PodcastEpisodeRowTopic[]> {
	// the most related public shown topics' podcast episodes, and the ones the user may listen to through their account
	const relatedPodcastEpisodeIds = await loadRelatedIds({
		cacheKey: `related-podcast-episode-scores:${podcastEpisodeId}`,
		toPublicRelatedScoresQuery: (transaction, embeddingCentroid) =>
			toPublicRelatedPodcastEpisodeScoresQuery(transaction, { podcastEpisodeId, topicId: topic.id, embeddingCentroid }),
		toAccessibleRelatedScoresQuery: userId
			? (embeddingCentroid) =>
					toAccessibleRelatedPodcastEpisodeScoresQuery(db, {
						podcastEpisodeId,
						topicId: topic.id,
						userId,
						embeddingCentroid,
					})
			: undefined,
	})
	if (relatedPodcastEpisodeIds.length === 0) {
		return []
	}

	// the podcast episodes as they stand now, each still published on another topic and one the user may listen to, in
	// the ranked order
	const relatedPodcastEpisodeRowTopics = await db
		.select({
			podcastEpisodeRow: podcastEpisodeColumns,
			topic: { id: topics.id, name: topics.name, visibility: topics.visibility },
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(
			and(
				inArray(podcastEpisodes.id, relatedPodcastEpisodeIds),
				eq(podcastEpisodes.status, "published"),
				ne(podcastEpisodes.topicId, topic.id),
				toPodcastEpisodeViewFilter(userId),
			),
		)
	return toRowsInIdOrder(
		relatedPodcastEpisodeIds,
		relatedPodcastEpisodeRowTopics,
		(relatedPodcastEpisodeRowTopic) => relatedPodcastEpisodeRowTopic.podcastEpisodeRow.id,
	)
}

// the page's podcast episode and its topic, and the average resource embedding that the read takes out of every vector
type ToPublicRelatedPodcastEpisodeScoresQueryOptions = {
	podcastEpisodeId: string
	topicId: string
	embeddingCentroid: number[]
}

/**
 * Returns the public related podcast episodes read: the current model vectors of other topics' podcast episodes whose
 * topic is saved as public and shown, nearest the podcast episode's through the public and shown index, each topic
 * checked again, with their related scores, kept within the limit, most related first. None at all unless the podcast
 * episode has a vector, and only a published podcast episode has one.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toPublicRelatedPodcastEpisodeScoresQuery(
	handle: DbHandle,
	{ podcastEpisodeId, topicId, embeddingCentroid }: ToPublicRelatedPodcastEpisodeScoresQueryOptions,
) {
	// the podcast episode's own current model vector, which orders the candidates
	const podcastEpisodeVectorQuery = toPodcastEpisodeVectorQuery(handle, podcastEpisodeId)

	// the vectors of other topics' podcast episodes whose topic is saved as public and shown, nearest by their plain
	// cosine distance, through the public and shown index
	const relatedPodcastEpisodeCandidates = handle.$with("related_episode_candidates").as(
		handle
			.select({
				podcastEpisodeId: podcastEpisodeVectors.podcastEpisodeId,
				topicId: podcastEpisodeVectors.topicId,
				embedding: podcastEpisodeVectors.embedding,
			})
			.from(podcastEpisodeVectors)
			.where(
				and(
					sql`${podcastEpisodeVectors.isTopicPublicAndShown}`,
					ne(podcastEpisodeVectors.topicId, topicId),
					eq(podcastEpisodeVectors.embeddingModel, EMBED_MODEL_NAME),
					exists(podcastEpisodeVectorQuery),
				),
			)
			.orderBy(sql`${podcastEpisodeVectors.embedding} <=> ${podcastEpisodeVectorQuery}`)
			.limit(RELATED_CANDIDATE_LIMIT),
	)

	// each candidate's score, with its topic's tags
	const relatedScore = toRelatedScore({
		candidateEmbedding: relatedPodcastEpisodeCandidates.embedding,
		pageEmbedding: podcastEpisodeVectorQuery,
		embeddingCentroid,
		candidateTags: topics.tags,
		pageTopicId: topicId,
	})

	// the candidates with their topics, whose tags the score reads
	const relatedPodcastEpisodeScoresQuery = handle
		.with(relatedPodcastEpisodeCandidates)
		.select({ id: relatedPodcastEpisodeCandidates.podcastEpisodeId, relatedScore: relatedScore.mapWith(Number) })
		.from(relatedPodcastEpisodeCandidates)
		.innerJoin(topics, eq(relatedPodcastEpisodeCandidates.topicId, topics.id))

	// the candidates whose topic is still public and shown, within the score's limit, most related first, so the cached
	// ranking holds public rows alone even if a saved flag is out of date
	return relatedPodcastEpisodeScoresQuery
		.where(and(isPublicAndShown, lte(relatedScore, MAX_RELATED_PODCAST_EPISODE_SCORE)))
		.orderBy(relatedScore)
		.limit(NO_SCRIPT_ROW_LIMIT)
}

// the page's podcast episode and its topic, the user, and the average resource embedding that the read takes out of
// every vector
type ToAccessibleRelatedPodcastEpisodeScoresQueryOptions = ToPublicRelatedPodcastEpisodeScoresQueryOptions & {
	userId: string
}

/**
 * Returns the accessible related podcast episodes read: other topics' published podcast episodes that the user may
 * listen to through their account, each with a current model vector, scored against the podcast episode's vector
 * without an index, kept within the limit, most related first.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toAccessibleRelatedPodcastEpisodeScoresQuery(
	handle: DbHandle,
	{ podcastEpisodeId, topicId, userId, embeddingCentroid }: ToAccessibleRelatedPodcastEpisodeScoresQueryOptions,
) {
	// each accessible podcast episode's score against the page's episode vector, with its topic's tags
	const relatedScore = toRelatedScore({
		candidateEmbedding: podcastEpisodeVectors.embedding,
		pageEmbedding: toPodcastEpisodeVectorQuery(handle, podcastEpisodeId),
		embeddingCentroid,
		candidateTags: topics.tags,
		pageTopicId: topicId,
	})

	// the accessible published podcast episodes within the score's limit, most related first
	return handle
		.select({ id: podcastEpisodeVectors.podcastEpisodeId, relatedScore: relatedScore.mapWith(Number) })
		.from(podcastEpisodeVectors)
		.innerJoin(podcastEpisodes, eq(podcastEpisodeVectors.podcastEpisodeId, podcastEpisodes.id))
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(
			and(
				toPodcastEpisodeAccessFilter(userId),
				eq(podcastEpisodes.status, "published"),
				ne(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodeVectors.embeddingModel, EMBED_MODEL_NAME),
				lte(relatedScore, MAX_RELATED_PODCAST_EPISODE_SCORE),
			),
		)
		.orderBy(relatedScore)
		.limit(NO_SCRIPT_ROW_LIMIT)
}

// the podcast episode's own current model vector
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
function toPodcastEpisodeVectorQuery(handle: DbHandle, podcastEpisodeId: string) {
	return handle
		.select({ embedding: podcastEpisodeVectors.embedding })
		.from(podcastEpisodeVectors)
		.where(
			and(
				eq(podcastEpisodeVectors.podcastEpisodeId, podcastEpisodeId),
				eq(podcastEpisodeVectors.embeddingModel, EMBED_MODEL_NAME),
			),
		)
}
