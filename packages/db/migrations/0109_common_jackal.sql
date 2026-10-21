-- every pending migration runs in one transaction, so the lock timeout bounds how long the chat turn locks wait behind
-- a long query, and a deploy that cannot get them in time fails fast
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."chat_turn_kind" AS ENUM('private', 'podcast', 'chat_room', 'transcription', 'speech');--> statement-breakpoint
CREATE TYPE "public"."episode_speaker" AS ENUM('host', 'cohost');--> statement-breakpoint
ALTER TABLE "chat_proposals" DROP CONSTRAINT "chat_proposals_page_unique";--> statement-breakpoint
ALTER TABLE "chat_proposals" ALTER COLUMN "digest" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD COLUMN "topic_edit" text;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "kind" "chat_turn_kind" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "episode_id" text;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "chapter_position" integer;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "podcast_answer_speaker" "episode_speaker";--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- every existing row has no podcast episode, so the foreign key checks new rows only and skips a full pass under the
-- table's lock
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE INDEX "chat_proposals_team_id_idx" ON "chat_proposals" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "chat_turns_episode_id_idx" ON "chat_turns" USING btree ("episode_id") WHERE "chat_turns"."episode_id" is not null;--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_page_unique" UNIQUE NULLS NOT DISTINCT("user_id","topic_id","team_id");--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_shape" CHECK (("chat_proposals"."team_id" is not null and "chat_proposals"."topic_id" is not null and "chat_proposals"."topic_edit" is not null and "chat_proposals"."digest" is null) or ("chat_proposals"."team_id" is null and "chat_proposals"."digest" is not null and "chat_proposals"."topic_edit" is null));