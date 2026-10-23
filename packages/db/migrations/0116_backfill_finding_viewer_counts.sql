-- count each finding's viewers as the distinct signed-in people with an open in finding_views, which keeps one row per
-- open. a dismissal row has no opened_at and counts nothing
UPDATE "findings" SET "viewer_count" = "finding_openers"."viewer_count"
FROM (
	SELECT "finding_id", count(DISTINCT "user_id")::integer AS "viewer_count"
	FROM "finding_views"
	WHERE "opened_at" IS NOT NULL
	GROUP BY "finding_id"
) AS "finding_openers"
WHERE "findings"."id" = "finding_openers"."finding_id";
