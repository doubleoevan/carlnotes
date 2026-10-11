CREATE TABLE "episode_vectors" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_vectors" (
	"topic_id" text PRIMARY KEY NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_vectors" ADD CONSTRAINT "episode_vectors_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_vectors" ADD CONSTRAINT "episode_vectors_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_vectors" ADD CONSTRAINT "topic_vectors_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_vectors_embedding_hnsw" ON "episode_vectors" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "topic_vectors_embedding_hnsw" ON "topic_vectors" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "episodes_title_lower_trgm" ON "episodes" USING gin (lower("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "episodes_description_lower_trgm" ON "episodes" USING gin (lower("description") gin_trgm_ops);