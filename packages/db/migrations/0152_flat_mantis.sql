CREATE TYPE "public"."topic_image_origin" AS ENUM('generated', 'uploaded');--> statement-breakpoint
CREATE TYPE "public"."topic_image_render_kind" AS ENUM('create', 'regenerate', 'admin', 'backfill', 'resize');--> statement-breakpoint
CREATE TYPE "public"."topic_image_render_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
ALTER TYPE "public"."report_subject_kind" ADD VALUE 'topicImage';--> statement-breakpoint
CREATE TABLE "topic_image_renders" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"user_id" text,
	"kind" "topic_image_render_kind" NOT NULL,
	"status" "topic_image_render_status" DEFAULT 'pending' NOT NULL,
	"model" text,
	"cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"scene" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "topic_images" (
	"topic_id" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"origin" "topic_image_origin" NOT NULL,
	"scene" text,
	"model" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "feature_order" integer;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD CONSTRAINT "topic_image_renders_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD CONSTRAINT "topic_image_renders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_images" ADD CONSTRAINT "topic_images_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_image_renders_user_kind_created_idx" ON "topic_image_renders" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "topic_image_renders_topic_created_idx" ON "topic_image_renders" USING btree ("topic_id","created_at");