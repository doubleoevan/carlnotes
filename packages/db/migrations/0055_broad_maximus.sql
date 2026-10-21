CREATE TYPE "public"."invite_access" AS ENUM('anyone', 'connected', 'nobody');--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "invited_user_id" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_access" "invite_access" DEFAULT 'anyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_topic_invited_user_unique" UNIQUE("topic_id","invited_user_id");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_team_invited_user_unique" UNIQUE("team_id","invited_user_id");