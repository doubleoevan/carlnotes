ALTER TABLE "room_summaries" DROP CONSTRAINT "room_summaries_topic_id_team_id_pk";--> statement-breakpoint
ALTER TABLE "room_attachments" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_messages" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_summaries" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_summaries" ADD COLUMN "id" text;--> statement-breakpoint
UPDATE "room_summaries" SET "id" = gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "room_summaries" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_summaries" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "room_summaries" ADD CONSTRAINT "room_summaries_room_unique" UNIQUE NULLS NOT DISTINCT("topic_id","team_id");