// tests that pin the shape of the topic, scan, finding, user, billing, and settings tables and the migration SQL that
// creates them
import { expect, test } from "bun:test"
import { listSourceFiles } from "@carlnotes/server/sourceFileTestFixtures"
import { getTableColumns } from "drizzle-orm"
import { schema } from "./index"
import { podcastEpisodes, topicVideos } from "./schema/podcast"
import { EMBED_DIMENSIONS, EMBED_MODEL_NAME, filteredFindings, findings, resources } from "./schema/scans"
import { spendControlSettings } from "./schema/spendControlSettings"
import { teams } from "./schema/teams"
import { topicEmailSends } from "./schema/topicEmailSends"
import { topicImageRenders } from "./schema/topicImages"
import { topicPostDiscussions } from "./schema/topicPosts"
import { attachments, subscriptions, topicPromptVersions, topics } from "./schema/topics"
import { oauthAccessTokens, oauthClients, oauthRefreshTokens, users } from "./schema/users"
import { viewerCounters } from "./schema/viewerCounts"
import { allMigrationsSql, initialSql } from "./schemaTestFixtures"

// ingestion inserts a Resource before the pipeline embeds it, so both embedding columns must be nullable
test("embedding and embedding_model are nullable", () => {
	expect(resources.embedding.notNull).toBe(false)
	expect(resources.embeddingModel.notNull).toBe(false)
})

// the embedding vector is migrated to 1024 dimensions for qwen3-embedding-8b
test("the embedding column is migrated to a 1024-dim vector", () => {
	expect(allMigrationsSql()).toContain("vector(1024)")
})

// a topic feed has no table. it gets built from a topic's findings at runtime.
test("no feeds table or export exists", () => {
	expect("feeds" in schema).toBe(false)
	expect(initialSql).not.toContain('CREATE TABLE "feeds"')
})

// tags are Topic metadata with an empty default, so existing rows need no backfill
test("topics.tags is a non-null, empty-default column and tags is not an entity", () => {
	expect(topics.tags.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`"tags" text[] DEFAULT '{}' NOT NULL`)
	expect("tags" in schema).toBe(false)
	expect("tags" in resources).toBe(false)
	expect("tags" in findings).toBe(false)
})

// tag filtering must be index-backed, so the named generalized inverted index (GIN) covers topics.tags
test("a generalized inverted index (GIN) covers topics.tags", () => {
	expect(allMigrationsSql()).toContain(`CREATE INDEX "topics_tags_gin" ON "topics" USING gin ("tags")`)
})

// the near-duplicate gate's nearest-neighbor lookup must be index-backed, and cosine, the distance it measures
test("an HNSW cosine index covers resources.embedding", () => {
	expect(allMigrationsSql()).toContain(
		`CREATE INDEX "resources_embedding_hnsw" ON "resources" USING hnsw ("embedding" vector_cosine_ops)`,
	)
})

// the conditional-refetch validators are captured only when a fetch exposes them, so both must be nullable
test("resources.etag and last_modified are nullable", () => {
	expect(resources.etag.notNull).toBe(false)
	expect(resources.lastModified.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(`"etag" text`)
	expect(allMigrationsSql()).toContain(`"last_modified" text`)
})

// the fetch-outcome counts are additive scan bookkeeping, so each is non-null and defaults to zero, needing no backfill
test("scans reused/revalidated/fetched are non-null and default to zero", () => {
	expect(schema.scans.reused.notNull).toBe(true)
	expect(schema.scans.revalidated.notNull).toBe(true)
	expect(schema.scans.fetched.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`"reused" integer DEFAULT 0 NOT NULL`)
})

// attachment processing is async, so a new attachment starts pending with its outcome columns nullable
test("attachments.status defaults to pending and its outcome columns are nullable", () => {
	expect(schema.attachments.status.notNull).toBe(true)
	expect(schema.attachments.error.notNull).toBe(false)
	expect(schema.attachments.charCount.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(`"status" "attachment_status" DEFAULT 'pending' NOT NULL`)
})

// a resource's content lives in object storage behind a key. the inline column stays for rows written before it
test("resources content_key and content_bytes are nullable and content is not dropped", () => {
	expect(resources.contentKey.notNull).toBe(false)
	expect(resources.contentBytes.notNull).toBe(false)
	expect("content" in resources).toBe(true)
	expect(allMigrationsSql()).toContain(`ADD COLUMN "content_key" text`)
})

// a Subscription's subscriber is a user, and nothing else. teams reach a topic through their members' own rows
test("a subscription names its subscribing user and nothing else", () => {
	expect(subscriptions.subscriberUserId).toBeDefined()
	expect(subscriptions.subscriberUserId.notNull).toBe(true)
	expect("subscriberAudienceId" in subscriptions).toBe(false)
})

// an invite is unique per topic and email through the composite primary key and gets deleted with its topic
test("topic_invites is keyed by topic and email and cascades from its topic", () => {
	expect(allMigrationsSql()).toContain(`CONSTRAINT "topic_invites_topic_id_email_pk" PRIMARY KEY("topic_id","email")`)
	expect(allMigrationsSql()).toMatch(/topic_invites_topic_id_topics_id_fk.*ON DELETE cascade/)
})

// re-inviting the same person is a no-op whether invited by email or by username, enforced per target by these indexes
test("invites have per-target unique indexes on the invited user", () => {
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "invites_topic_invited_user_unique" UNIQUE("topic_id","invited_user_id")`,
	)
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "invites_team_invited_user_unique" UNIQUE("team_id","invited_user_id")`,
	)
	// a closed account's pending invitations clear with it
	expect(allMigrationsSql()).toMatch(/invites_invited_user_id_users_id_fk.*ON DELETE cascade/)
})

// a link invite names nobody: the email and invited-user columns are both nullable, so a row with neither is accepted
test("a link invite row names nobody", () => {
	expect(schema.invites.email.notNull).toBe(false)
	expect(schema.invites.invitedUserId.notNull).toBe(false)
	// the decline time and the recipient setting round out the user-invite lifecycle
	expect(schema.invites.declinedAt.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(`"invite_access" "invite_access" DEFAULT 'anyone' NOT NULL`)
})

// a scan records whether the owner triggered it by hand, so the marker must exist and default to false
test("scans.is_manual is non-null and defaults to false", () => {
	expect(schema.scans.isManual.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`"is_manual" boolean DEFAULT false NOT NULL`)
})

// platform authority is a users.role column with a safe default, text-shaped for Better Auth's admin plugin
test("users.role is non-null and defaults to user", () => {
	expect(schema.users.role.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`"role" text DEFAULT 'user' NOT NULL`)
})

// the billing plan is a proper pgEnum, unlike role, which an external library constrains
test("users.plan is a free/plus/premium enum, non-null, and defaults to free", () => {
	expect(schema.users.plan.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`CREATE TYPE "public"."plan" AS ENUM('free', 'plus', 'premium')`)
	expect(allMigrationsSql()).toContain(`"plan" "plan" DEFAULT 'free' NOT NULL`)
})

// a billing subscription mirrors a user's active Stripe subscription and derives their plan
test("billing_subscriptions is one-per-user, cascades, and has the Stripe, plan, and card columns", () => {
	expect("billingSubscriptions" in schema).toBe(true)
	expect(schema.billingSubscriptions.hasPaymentMethod.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`CONSTRAINT "billing_subscriptions_user_id_unique" UNIQUE("user_id")`)
	expect(allMigrationsSql()).toMatch(/billing_subscriptions_user_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toContain(`"has_payment_method" boolean DEFAULT false NOT NULL`)
})

// the per-user budget override is nullable, where a null means the plan's own monthly backstop applies
test("users.budget_override_cents is a nullable integer", () => {
	expect(schema.users.budgetOverrideCents.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(`ADD COLUMN "budget_override_cents" integer`)
})

// the kept-set size is constrained to the shared allowed values, and the default doubles as the migration backfill
test("topics.max_results defaults to ten and is checked against the allowed sizes", () => {
	expect(schema.topics.maxTopicFindings.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`"max_results" integer DEFAULT 10 NOT NULL`)
	expect(allMigrationsSql()).toContain(`CHECK (max_results in (5, 10, 15, 20))`)
})

// a bookmark is a per-user row like consumption, never a findings column
test("bookmarks is unique per user and finding and cascades from both parents", () => {
	expect("bookmarks" in schema).toBe(true)
	expect("bookmarked" in findings).toBe(false)
	expect(allMigrationsSql()).toContain(`CONSTRAINT "bookmarks_user_finding_unique" UNIQUE("user_id","finding_id")`)
	expect(allMigrationsSql()).toMatch(/bookmarks_user_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/bookmarks_finding_id_findings_id_fk.*ON DELETE cascade/)
})

// a filtered finding is a row of its own per topic and resource, never a findings column, and holds no text. deleting
// either parent removes it
test("filtered_findings is keyed by topic and resource, holds no text, and cascades from both parents", () => {
	expect("filteredFindings" in schema).toBe(true)
	expect("filteredAt" in findings).toBe(false)
	expect(Object.keys(getTableColumns(filteredFindings)).toSorted()).toEqual([
		"filteredAt",
		"personalSourceScoreBonus",
		"relevanceScore",
		"resourceId",
		"reviewedContentHash",
		"reviewedContextHash",
		"topicId",
	])

	// one row per topic and resource, the resource index for a resource's delete, and both cascades
	const migrationsSql = allMigrationsSql()
	expect(migrationsSql).toContain(
		`CONSTRAINT "filtered_findings_topic_id_resource_id_pk" PRIMARY KEY("topic_id","resource_id")`,
	)
	expect(migrationsSql).toContain(
		`CREATE INDEX "filtered_findings_resource_id_idx" ON "filtered_findings" USING btree ("resource_id")`,
	)
	expect(migrationsSql).toMatch(/filtered_findings_topic_id_topics_id_fk.*ON DELETE cascade/)
	expect(migrationsSql).toMatch(/filtered_findings_resource_id_resources_id_fk.*ON DELETE cascade/)

	// a finding with no reviewed context hash leaves no row, so the row's context hash is never null
	expect(filteredFindings.reviewedContextHash.notNull).toBe(true)
	expect(filteredFindings.reviewedContentHash.notNull).toBe(false)
})

// the consumed state is a per-user row, never a findings column, so it lives in the consumptions table only
test("consumptions holds per-user consumed state and findings does not", () => {
	expect("consumptions" in schema).toBe(true)
	expect("consumed" in findings).toBe(false)
	expect("seen" in findings).toBe(false)
})

// a consumed marker is unique per user and finding, so a second mark is a no-op. deleting either parent removes it
test("consumptions is unique per user and finding and it cascades from both parents", () => {
	expect(allMigrationsSql()).toContain(`CONSTRAINT "consumptions_user_finding_unique" UNIQUE("user_id","finding_id")`)
	expect(allMigrationsSql()).toMatch(/consumptions_user_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/consumptions_finding_id_findings_id_fk.*ON DELETE cascade/)
})

// a Scan's email rows name the Scan, once per recipient, and an invite's row names no Scan
test("topic_email_sends names its Scan, set null on delete, and is unique per Scan and recipient", () => {
	expect(topicEmailSends.scanId.notNull).toBe(false)
	expect(allMigrationsSql()).toMatch(/topic_email_sends_scan_id_scans_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toContain(
		`CREATE UNIQUE INDEX "topic_email_sends_scan_recipient_unique" ON "topic_email_sends" USING btree ("scan_id","recipient_user_id")`,
	)
})

// the embedding model name is stored by review and filtered on by chat retrieval
test("the embedding model name is a schema constant that includes the dimension", () => {
	expect(EMBED_MODEL_NAME).toBe(`qwen3-embedding-8b/${EMBED_DIMENSIONS}`)
})

// dispatched_at has no default, which would make every existing row look dispatched already
test("scans records dispatch as a nullable column and backfills finished rows", () => {
	expect(allMigrationsSql()).toMatch(/ALTER TABLE "scans" ADD COLUMN "dispatched_at" timestamp with time zone;/)
	expect(allMigrationsSql()).not.toMatch(/"dispatched_at" timestamp with time zone DEFAULT/)
	expect(allMigrationsSql()).toMatch(/UPDATE "scans" SET "dispatched_at" = "started_at" WHERE "status" <> 'running'/)
})

// a scan saved before per-source results keeps null, so the column has no default and the migration backfills nothing.
// the alter waits on the scans lock for at most the lock timeout
test("scans.source_results is a nullable jsonb column added under a lock timeout with no backfill", () => {
	expect(schema.scans.sourceResults.notNull).toBe(false)
	expect(allMigrationsSql()).toMatch(
		/SET LOCAL lock_timeout = '3s';--> statement-breakpoint\nALTER TABLE "scans" ADD COLUMN "source_results" jsonb;/,
	)
	expect(allMigrationsSql()).not.toMatch(/"source_results" jsonb DEFAULT/)
	expect(allMigrationsSql()).not.toMatch(/UPDATE "scans" SET "source_results"/)
})

// reading signal is record-only. an import path that ends in the findingFeedback module names no table
test("finding feedback and views are written and displayed, never read into ranking", () => {
	const readers = listSourceFiles(["apps/api", "apps/worker", "packages/pipeline"])
		.filter((file) => /(?<!\/)findingFeedback|findingViews|ratedTeamId|ratedRole/.test(file.text))
		.map((file) => file.path)
	// the viewer count seed reads opens only to count the people a topic page shows as its viewers
	expect(readers.sort()).toEqual([
		"apps/api/topic/findingFeedback.ts",
		"apps/api/topic/findings.ts",
		"apps/worker/viewerCountSeeds.ts",
	])
})

// a prompt version cascades from its topic and keeps its row when the account that saved it closes.
// its origin is editor, chat, or mcp, and the topic-and-time index covers the history read
test("topic_prompt_versions cascades from its topic, nulls its user, and indexes topic and time", () => {
	expect(topicPromptVersions.prompt.notNull).toBe(true)
	expect(topicPromptVersions.savedByUserId.notNull).toBe(false)
	expect(topicPromptVersions.origin.notNull).toBe(true)
	// the migration SQL holds the cascades, the enum, and the index
	expect(allMigrationsSql()).toMatch(/topic_prompt_versions_topic_id_topics_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/topic_prompt_versions_saved_by_user_id_users_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toMatch(/CREATE TYPE "public"\."prompt_version_origin" AS ENUM\('editor', 'chat', 'mcp'\)/)
	expect(allMigrationsSql()).toMatch(/CREATE INDEX (IF NOT EXISTS )?"topic_prompt_versions_topic_created_idx"/)
})

// the oauth tables mirror Better Auth's mcp plugin, cascading from their client and user and clearing a deleted session
test("the oauth tables mirror the mcp plugin's models and cascade from their client", () => {
	expect(oauthClients.clientId.isUnique).toBe(true)
	expect(oauthAccessTokens.userId.notNull).toBe(false)
	expect(oauthRefreshTokens.userId.notNull).toBe(true)
	// the migration SQL holds the cascades
	expect(allMigrationsSql()).toMatch(/oauth_access_tokens_client_id_oauth_clients_client_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/oauth_refresh_tokens_user_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/oauth_access_tokens_session_id_sessions_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toMatch(/oauth_consents_user_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/oauth_clients_user_id_users_id_fk.*ON DELETE cascade/)
})

// a finding keeps the scan that first found it apart from the scan that last reviewed it. the first scan is nullable, so
// a deleted scan clears it instead of deleting the finding, and every finding from before the column is backfilled
test("findings.found_scan_id is nullable, set null on delete, indexed, and backfilled from scan_id", () => {
	expect(findings.foundScanId.notNull).toBe(false)
	expect(findings.scanId.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`ALTER TABLE "findings" ADD COLUMN "found_scan_id" text`)
	expect(allMigrationsSql()).toMatch(/findings_found_scan_id_scans_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "findings_found_scan_id_idx" ON "findings" USING btree ("found_scan_id")',
	)
	expect(allMigrationsSql()).toContain(
		`UPDATE "findings" SET "found_scan_id" = "scan_id" WHERE "found_scan_id" IS NULL`,
	)
})

// the duplicate check reads resources by content hash, and the new finding count reads a topic's findings by arrival
test("resources are indexed by content hash and findings by topic and arrival", () => {
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "resources_content_hash_idx" ON "resources" USING btree ("content_hash")',
	)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "findings_topic_created_idx" ON "findings" USING btree ("topic_id","created_at")',
	)
})

// a saved counter names exactly one of a topic, a podcast episode, a profile's user, and a team, and the profile and
// team counts default to zero
test("viewer_counters name exactly one of four, and profiles and teams hold a viewer count", () => {
	expect(users.profileViewerCount.notNull).toBe(true)
	expect(teams.viewerCount.notNull).toBe(true)
	expect(viewerCounters.profileUserId.isUnique).toBe(true)
	expect(viewerCounters.teamId.isUnique).toBe(true)
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "viewer_counters_ref_shape" CHECK (num_nonnulls("viewer_counters"."topic_id", "viewer_counters"."episode_id", "viewer_counters"."profile_user_id", "viewer_counters"."team_id") = 1)`,
	)
})

// a settings row saved before these columns reads every new switch as off. each pause and the featured-only home take
// false, and the generated chapter image limit takes no value, which reads as its default
test("the pauses and the featured-only home in spend_control_settings default to false, and the generated chapter image limit is nullable with no default", () => {
	// each pause and the featured-only home
	expect(spendControlSettings.isPodcastEpisodeRecordingPaused.notNull).toBe(true)
	expect(spendControlSettings.isPodcastEpisodeRecordingPaused.default).toBe(false)
	expect(spendControlSettings.isTopicVideoRenderingPaused.notNull).toBe(true)
	expect(spendControlSettings.isTopicVideoRenderingPaused.default).toBe(false)
	expect(spendControlSettings.isHomeFeaturedOnly.notNull).toBe(true)
	expect(spendControlSettings.isHomeFeaturedOnly.default).toBe(false)

	// the generated chapter image limit
	expect(spendControlSettings.generatedChapterImageLimit.notNull).toBe(false)
	expect(spendControlSettings.generatedChapterImageLimit.hasDefault).toBe(false)

	// the migration adds each column the same way, so it fills the row that is already saved with every switch off
	const migrationsSql = allMigrationsSql()
	expect(migrationsSql).toContain(`ADD COLUMN "is_podcast_episode_recording_paused" boolean DEFAULT false NOT NULL`)
	expect(migrationsSql).toContain(
		`ADD COLUMN "is_topic_podcast_episode_video_rendering_paused" boolean DEFAULT false NOT NULL`,
	)
	expect(migrationsSql).toContain(`ADD COLUMN "is_home_pinned_only" boolean DEFAULT false NOT NULL`)
	expect(migrationsSql).toMatch(/ADD COLUMN "generated_chapter_image_limit" integer;/)
})

// the reaper records on a row that it started the row's work again, and reads the recordings in progress by when each
// began
test("the five kinds of row the reaper restarts hold a nullable restarted_at, and the recordings in progress are indexed", () => {
	const restartedAtColumns = [
		podcastEpisodes.restartedAt,
		topicVideos.restartedAt,
		topicPostDiscussions.restartedAt,
		topicImageRenders.restartedAt,
		attachments.restartedAt,
	]
	expect(restartedAtColumns.map((restartedAtColumn) => restartedAtColumn.notNull)).toEqual(Array(5).fill(false))

	// the index holds only the rows still recording, and if not exists skips one built by hand before the deploy
	expect(allMigrationsSql()).toContain(
		`CREATE INDEX IF NOT EXISTS "episodes_recording_created_idx" ON "episodes" USING btree ("created_at") WHERE "episodes"."status" = 'recording'`,
	)
})

// the day's spend sums each table by time, the sweep counts signups by time, and it reads the Scans still running and
// the Sources still pending
test("each summed table and users are indexed by time, and the running Scans and pending Sources by their status", () => {
	// an index led by the time column of each summed table and of users
	const timeIndexes = [
		`"scans_started_idx" ON "scans" USING btree ("started_at")`,
		`"chat_turns_created_idx" ON "chat_turns" USING btree ("created_at")`,
		`"episodes_created_idx" ON "episodes" USING btree ("created_at")`,
		`"topic_videos_created_idx" ON "topic_videos" USING btree ("created_at")`,
		`"personal_source_distillation_spends_created_idx" ON "personal_source_distillation_spends" USING btree ("created_at")`,
		`"topic_image_renders_created_idx" ON "topic_image_renders" USING btree ("created_at")`,
		`"topic_post_discussions_created_idx" ON "topic_post_discussions" USING btree ("created_at")`,
		`"users_created_idx" ON "users" USING btree ("created_at")`,
	]

	// the two partial indexes hold only the rows still in progress
	const partialIndexes = [
		`"scans_running_started_idx" ON "scans" USING btree ("started_at","id") WHERE "scans"."status" = 'running'`,
		`"sources_pending_topic_idx" ON "sources" USING btree ("topic_id") WHERE "sources"."status" = 'pending'`,
	]

	// if not exists skips each one that was built concurrently by hand before the deploy
	const migrationsSql = allMigrationsSql()
	for (const indexSql of [...timeIndexes, ...partialIndexes]) {
		expect(migrationsSql).toContain(`CREATE INDEX IF NOT EXISTS ${indexSql}`)
	}
})
