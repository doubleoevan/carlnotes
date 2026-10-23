-- count each finding's views as every open in finding_views again, which keeps one row per open, so the opens since
-- view_count stopped being written count too. greatest keeps a count from before finding_views recorded opens. a
-- dismissal row has no opened_at and counts nothing
UPDATE "findings" SET "view_count" = greatest("findings"."view_count", "finding_opens"."view_count")
FROM (
	SELECT "finding_id", count(*)::integer AS "view_count"
	FROM "finding_views"
	WHERE "opened_at" IS NOT NULL
	GROUP BY "finding_id"
) AS "finding_opens"
WHERE "findings"."id" = "finding_opens"."finding_id";
