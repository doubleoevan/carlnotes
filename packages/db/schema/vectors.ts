// the mean vectors that rank related topics, related podcast episodes, and the podcast episode search, each in its own
// table so that a read of a whole topic or episode row never includes a vector
import { sql } from "drizzle-orm"
import { boolean, index, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core"
import { podcastEpisodes } from "./podcast"
import { EMBED_DIMENSIONS } from "./scans"
import { topics } from "./topics"

// a topic's vector: the mean of its kept findings' resource embeddings
export const topicVectors = pgTable(
	"topic_vectors",
	{
		// the topic, whose delete deletes its vector
		topicId: text("topic_id")
			.primaryKey()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the mean embedding and the model that embedded every resource in it
		embedding: vector("embedding", { dimensions: EMBED_DIMENSIONS }).notNull(),
		embeddingModel: text("embedding_model").notNull(),
		// when the vector was last saved
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		// whether the topic is public and shown, saved with the vector
		isPublicAndShown: boolean("is_public_and_shown").notNull().default(false),
	},
	// ranks the public shown topics nearest a topic, so the shared read never walks past private, invite, and public
	// topics not yet shown. a user's own read of the topics they may open scores them without an index
	(table) => [
		index("topic_vectors_public_and_shown_embedding_hnsw")
			.using("hnsw", table.embedding.op("vector_cosine_ops"))
			.where(sql`${table.isPublicAndShown}`),
	],
)

// a published podcast episode's vector: the mean of its chapters' resource embeddings
export const podcastEpisodeVectors = pgTable(
	"episode_vectors",
	{
		// the podcast episode, whose delete deletes its vector
		podcastEpisodeId: text("episode_id")
			.primaryKey()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		// the podcast episode's topic. a topic delete keeps its episode rows and deletes their vectors
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the mean embedding and the model that embedded every resource in it
		embedding: vector("embedding", { dimensions: EMBED_DIMENSIONS }).notNull(),
		embeddingModel: text("embedding_model").notNull(),
		// when the vector was last saved
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		// whether the podcast episode's topic is public and shown, saved at publish and again with the topic's vector
		isTopicPublicAndShown: boolean("is_topic_public_and_shown").notNull().default(false),
	},
	(table) => [
		// ranks the podcast episodes nearest a search query for a user or an admin
		index("episode_vectors_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
		// ranks the public shown topics' podcast episodes nearest an episode or a visitor's search query, so a read
		// never walks past the episodes of private, invite, and public topics not yet shown
		index("episode_vectors_public_and_shown_embedding_hnsw")
			.using("hnsw", table.embedding.op("vector_cosine_ops"))
			.where(sql`${table.isTopicPublicAndShown}`),
	],
)
