SET LOCAL lock_timeout = '3s';
--> statement-breakpoint
ALTER TYPE "topic_memory_kind" RENAME TO "topic_memory_kind_legacy";
--> statement-breakpoint
CREATE TYPE "topic_memory_kind" AS ENUM ('fact', 'correction');
--> statement-breakpoint
ALTER TABLE "topic_memories"
	DROP CONSTRAINT "topic_memories_player_key",
	DROP COLUMN "player_key",
	ALTER COLUMN "kind" TYPE "topic_memory_kind" USING (
		CASE WHEN "kind"::text = 'correction' THEN 'correction' ELSE 'fact' END
	)::"topic_memory_kind";
--> statement-breakpoint
DROP TYPE "topic_memory_kind_legacy";
--> statement-breakpoint
UPDATE "topic_memories"
SET "person" = CASE
	WHEN "person" ? 'identifyingDetail' THEN "person" - 'disambiguator'
	ELSE ("person" - 'disambiguator') || jsonb_build_object('identifyingDetail', "person"->'disambiguator')
END
WHERE "person" ? 'disambiguator';
--> statement-breakpoint
UPDATE "topic_memory_decisions" SET "source" = 'legacy' WHERE "source" = 'player';
