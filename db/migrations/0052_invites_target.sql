ALTER TABLE "topic_invites" RENAME TO "invites";--> statement-breakpoint
ALTER TABLE "invites" RENAME CONSTRAINT "topic_invites_topic_id_topics_id_fk" TO "invites_topic_id_topics_id_fk";--> statement-breakpoint
ALTER TABLE "invites" RENAME CONSTRAINT "topic_invites_invited_by_user_id_users_id_fk" TO "invites_invited_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_target_xor" CHECK (("team_id" is not null) <> ("topic_id" is not null));--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_team_email_unique" UNIQUE("team_id","email");
