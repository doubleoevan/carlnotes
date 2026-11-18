SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "topic_video_motion_uses" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"month" timestamp with time zone NOT NULL,
	"asset" text NOT NULL,
	"episode_id" text
);
--> statement-breakpoint
ALTER TABLE "topic_video_motion_uses" ADD CONSTRAINT "topic_video_motion_uses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_video_motion_uses" ADD CONSTRAINT "topic_video_motion_uses_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_video_motion_uses_owner_month_asset" ON "topic_video_motion_uses" USING btree ("owner_id","month","asset");--> statement-breakpoint
CREATE INDEX "topic_video_motion_uses_episode_idx" ON "topic_video_motion_uses" USING btree ("episode_id");
