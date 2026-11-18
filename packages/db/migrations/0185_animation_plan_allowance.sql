SET LOCAL lock_timeout = '3s';--> statement-breakpoint

ALTER TABLE "topic_video_motion_uses" ADD COLUMN "uses_plan_allowance" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "topic_video_animation_uses_plan_allowance_idx" ON "topic_video_motion_uses" USING btree ("owner_id","month","uses_plan_allowance");