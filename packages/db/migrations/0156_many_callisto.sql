SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "topic_images" ADD COLUMN "image_prompt" text;