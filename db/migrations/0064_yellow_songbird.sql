ALTER TABLE "invites" DROP CONSTRAINT "topic_invites_token_unique";--> statement-breakpoint
ALTER TABLE "invites" DROP CONSTRAINT "topic_invites_topic_email_unique";--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_token_unique" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_topic_email_unique" UNIQUE("topic_id","email");