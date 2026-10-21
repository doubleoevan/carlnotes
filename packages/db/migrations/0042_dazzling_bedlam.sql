-- the daily publish limit is gone, and this column existed only to measure it. nothing reads it now.
-- the two username NOT NULL statements drizzle generated alongside this are already applied by 0041.
ALTER TABLE "topics" DROP COLUMN "published_at";
