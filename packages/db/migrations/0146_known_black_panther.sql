SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DELETE FROM "agent_api_keys" WHERE "revoked_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_api_keys" DROP COLUMN "revoked_at";