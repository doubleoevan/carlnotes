CREATE TABLE "team_topics" (
	"team_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_topics_team_id_topic_id_pk" PRIMARY KEY("team_id","topic_id")
);
--> statement-breakpoint
DROP INDEX "room_messages_topic_id_idx";--> statement-breakpoint
ALTER TABLE "room_attachments" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "room_messages" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "room_summaries" ADD COLUMN "team_id" text;--> statement-breakpoint
UPDATE "room_messages" SET "team_id" = "topics"."team_id" FROM "topics" WHERE "topics"."id" = "room_messages"."topic_id";--> statement-breakpoint
UPDATE "room_attachments" SET "team_id" = "topics"."team_id" FROM "topics" WHERE "topics"."id" = "room_attachments"."topic_id";--> statement-breakpoint
UPDATE "room_summaries" SET "team_id" = "topics"."team_id" FROM "topics" WHERE "topics"."id" = "room_summaries"."topic_id";--> statement-breakpoint
DELETE FROM "room_messages" WHERE "team_id" IS NULL;--> statement-breakpoint
DELETE FROM "room_attachments" WHERE "team_id" IS NULL;--> statement-breakpoint
DELETE FROM "room_summaries" WHERE "team_id" IS NULL;--> statement-breakpoint
ALTER TABLE "room_messages" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_attachments" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_summaries" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_summaries" DROP CONSTRAINT "room_summaries_pkey";--> statement-breakpoint
ALTER TABLE "room_summaries" ADD CONSTRAINT "room_summaries_topic_id_team_id_pk" PRIMARY KEY("topic_id","team_id");--> statement-breakpoint
ALTER TABLE "team_topics" ADD CONSTRAINT "team_topics_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_topics" ADD CONSTRAINT "team_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_topics_topic_id_idx" ON "team_topics" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "room_attachments" ADD CONSTRAINT "room_attachments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_summaries" ADD CONSTRAINT "room_summaries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_messages_topic_id_idx" ON "room_messages" USING btree ("topic_id","team_id","id");