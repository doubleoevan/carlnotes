DROP INDEX "topic_vectors_embedding_hnsw";--> statement-breakpoint
ALTER TABLE "topic_vectors" ADD COLUMN "is_public_and_shown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "topic_vectors_public_and_shown_embedding_hnsw" ON "topic_vectors" USING hnsw ("embedding" vector_cosine_ops) WHERE "topic_vectors"."is_public_and_shown";