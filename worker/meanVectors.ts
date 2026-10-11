// the mean vectors that rank related topics, related podcast episodes, and the podcast episode search. each is the
// average of the resource embeddings behind it, counting the current embedding model's embeddings alone, computed in
// sql
import { and, eq, exists, inArray, ne, sql } from "drizzle-orm"
import { type DbHandle, db, isCurrentModelEmbedding, isFindingShown, isPublicAndShown } from "../db"
import { podcastEpisodeChapters, podcastEpisodes } from "../db/schema/podcast"
import { EMBED_MODEL_NAME, findings, resources } from "../db/schema/scans"
import { topics } from "../db/schema/topics"
import { podcastEpisodeVectors, topicVectors } from "../db/schema/vectors"

// the fields that both mean vector selects share, in the vector tables' column order. they are the average of the
// resource embeddings, the current embedding model, and the save time
const MEAN_VECTOR_FIELDS = {
	embedding: sql<number[]>`avg(${resources.embedding})`.as("embedding"),
	embeddingModel: sql<string>`${EMBED_MODEL_NAME}`.as("embedding_model"),
	updatedAt: sql<Date>`now()`.as("updated_at"),
}

// the columns a vector upsert writes over an existing row
const UPSERTED_VECTOR_COLUMNS = {
	embedding: sql`excluded.embedding`,
	embeddingModel: sql`excluded.embedding_model`,
	updatedAt: sql`excluded.updated_at`,
}

/**
 * Saves a topic's vector, the mean of its kept findings' resource embeddings, with whether the topic is public and
 * shown, or deletes the vector of a topic with no kept finding that has a current model embedding. Also saves whether
 * the topic is public and shown on its podcast episodes' vectors. Returns whether the topic has a vector.
 */
export async function saveTopicVectors(topicId: string): Promise<boolean> {
	// the mean over the topic's kept findings, with whether the topic is public and shown. the selected fields follow
	// the table's column order
	const topicMeanVector = db
		.select({
			topicId: findings.topicId,
			...MEAN_VECTOR_FIELDS,
			isPublicAndShown: sql<boolean>`${isPublicAndShown}`.as("is_public_and_shown"),
		})
		// the topic's kept findings whose resources the current model embedded
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.where(and(eq(findings.topicId, topicId), isFindingShown, isCurrentModelEmbedding))
		.groupBy(findings.topicId, topics.id)

	// write the mean over the topic's vector
	const savedTopicVectorRows = await db
		.insert(topicVectors)
		.select(topicMeanVector)
		.onConflictDoUpdate({
			target: topicVectors.topicId,
			set: { ...UPSERTED_VECTOR_COLUMNS, isPublicAndShown: sql`excluded.is_public_and_shown` },
		})
		.returning({ topicId: topicVectors.topicId })

	// delete the vector if there was no mean
	if (savedTopicVectorRows.length === 0) {
		await db.delete(topicVectors).where(eq(topicVectors.topicId, topicId))
	}

	// save whether the topic is public and shown on its podcast episodes' vectors, writing only the rows that change
	const isTopicPublicAndShown = exists(
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(eq(topics.id, topicId), isPublicAndShown)),
	)
	await db
		.update(podcastEpisodeVectors)
		.set({ isTopicPublicAndShown })
		.where(
			and(
				eq(podcastEpisodeVectors.topicId, topicId),
				ne(podcastEpisodeVectors.isTopicPublicAndShown, isTopicPublicAndShown),
			),
		)
	return savedTopicVectorRows.length > 0
}

/**
 * Saves a podcast episode's vector, the mean of its chapters' resource embeddings, with whether its topic is public and
 * shown, or deletes it if no chapter's resource has a current model embedding. Returns whether the podcast episode has
 * a vector.
 */
export async function savePodcastEpisodeVector(podcastEpisodeId: string, handle: DbHandle = db): Promise<boolean> {
	// the mean over the podcast episode's chapters, with whether its topic is public and shown. an episode with no topic
	// has no vector, and the selected fields follow the table's column order
	const podcastEpisodeMeanVector = handle
		.select({
			podcastEpisodeId: podcastEpisodeChapters.podcastEpisodeId,
			topicId: topics.id,
			...MEAN_VECTOR_FIELDS,
			isTopicPublicAndShown: sql<boolean>`${isPublicAndShown}`.as("is_topic_public_and_shown"),
		})
		// the podcast episode's chapters whose resources the current model embedded
		.from(podcastEpisodeChapters)
		.innerJoin(podcastEpisodes, eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodes.id))
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.innerJoin(resources, eq(podcastEpisodeChapters.resourceId, resources.id))
		.where(and(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId), isCurrentModelEmbedding))
		.groupBy(podcastEpisodeChapters.podcastEpisodeId, topics.id)

	// write the mean over the podcast episode's vector
	const savedPodcastEpisodeVectorRows = await handle
		.insert(podcastEpisodeVectors)
		.select(podcastEpisodeMeanVector)
		.onConflictDoUpdate({
			target: podcastEpisodeVectors.podcastEpisodeId,
			set: { ...UPSERTED_VECTOR_COLUMNS, isTopicPublicAndShown: sql`excluded.is_topic_public_and_shown` },
		})
		.returning({ podcastEpisodeId: podcastEpisodeVectors.podcastEpisodeId })

	// delete the vector if there was no mean
	if (savedPodcastEpisodeVectorRows.length === 0) {
		await deletePodcastEpisodeVectors([podcastEpisodeId], handle)
	}
	return savedPodcastEpisodeVectorRows.length > 0
}

/**
 * Deletes the podcast episodes' vectors.
 */
export async function deletePodcastEpisodeVectors(podcastEpisodeIds: string[], handle: DbHandle = db): Promise<void> {
	await handle.delete(podcastEpisodeVectors).where(inArray(podcastEpisodeVectors.podcastEpisodeId, podcastEpisodeIds))
}
