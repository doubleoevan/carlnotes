SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "resource_images" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"position" integer NOT NULL,
	"object_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"source_url" text NOT NULL,
	"is_link_preview_image" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_images_resource_position_unique" UNIQUE("resource_id","position")
);
--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_videos" ADD COLUMN "render_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_videos" ADD COLUMN "failed_render_version" integer;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "images_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resource_images" ADD CONSTRAINT "resource_images_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;