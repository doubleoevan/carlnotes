ALTER TABLE "topic_invites" DROP CONSTRAINT "topic_invites_topic_id_email_pk";--> statement-breakpoint
ALTER TABLE "topic_invites" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD COLUMN "id" text;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD COLUMN "token" text;--> statement-breakpoint
UPDATE "topic_invites" SET "id" = gen_random_uuid()::text, "token" = gen_random_uuid()::text WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "topic_invites" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_invites" ALTER COLUMN "token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "topic_invites" ADD COLUMN "invited_by_user_id" text;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD COLUMN "max_uses" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD COLUMN "used_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD CONSTRAINT "topic_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_invites" ADD CONSTRAINT "topic_invites_token_unique" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "topic_invites" ADD CONSTRAINT "topic_invites_topic_email_unique" UNIQUE("topic_id","email");
