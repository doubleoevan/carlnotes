// tests that pin the shape of the domain schema and the migration SQL that creates it
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { listSourceFiles } from "@carlnotes/server/sourceFileTestFixtures"
import { schema } from "./index"
import { chatProposals, chatRoomMessages, chatTurns } from "./schema/chat"
import { podcastEpisodeChapters, podcastEpisodes } from "./schema/podcast"
import { EMBED_DIMENSIONS, EMBED_MODEL_NAME, findings, resources } from "./schema/scans"
import { commentMentions, comments, reactions } from "./schema/social"
import { spendControlSettings } from "./schema/spendControlSettings"
import { teams } from "./schema/teams"
import { topicEmailSends } from "./schema/topicEmailSends"
import { topicPostDiscussions, topicPosts } from "./schema/topicPosts"
import { subscriptions, topicPromptVersions, topics } from "./schema/topics"
import { oauthAccessTokens, oauthClients, oauthRefreshTokens, users } from "./schema/users"
import { viewerCounters } from "./schema/viewerCounts"

// read the generated initial migration once for SQL-level assertions
const migrationsDirectory = join(import.meta.dir, "migrations")
const initialSql = readFileSync(join(migrationsDirectory, firstMigrationFile()), "utf8")

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

// pgvector must be enabled before the resources table that uses the vector embedding is created
test("the initial migration enables pgvector before the vector column", () => {
	expect(initialSql).toContain("CREATE EXTENSION IF NOT EXISTS vector")
	expect(initialSql.indexOf("CREATE EXTENSION IF NOT EXISTS vector")).toBeLessThan(initialSql.indexOf("vector(768)"))
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

// a chat turn requires a user and a cost
test("chat_turns keeps its text nullable and its user and cost not null", () => {
	expect(chatTurns.question.notNull).toBe(false)
	expect(chatTurns.answer.notNull).toBe(false)
	expect(chatTurns.userId.notNull).toBe(true)
	expect(chatTurns.cost.notNull).toBe(true)
})

// a spoken question and carl's reply to it are marked on both tables, and a typed one defaults to false
test("chat_turns.is_spoken and room_messages.is_spoken are non-null and default to false", () => {
	expect(chatTurns.isSpoken.notNull).toBe(true)
	expect(chatRoomMessages.isSpoken.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`ALTER TABLE "chat_turns" ADD COLUMN "is_spoken" boolean DEFAULT false NOT NULL`)
	expect(allMigrationsSql()).toContain(
		`ALTER TABLE "room_messages" ADD COLUMN "is_spoken" boolean DEFAULT false NOT NULL`,
	)
})

// deleting a user or a topic takes its chat turns with it, and the topic-and-time index covers the conversation read
test("chat_turns cascades from both parents and indexes topic and time", () => {
	expect(allMigrationsSql()).toMatch(/chat_turns_user_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/chat_turns_topic_id_topics_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/CREATE INDEX (IF NOT EXISTS )?"chat_turns_topic_created_idx"/)
})

// every chat turn row names its kind, which has no default after the backfill, and a podcast chat turn's podcast
// episode cascades
test("chat_turns.kind is a non-null chat_turn_kind with no default, backfilled from the chat room message", () => {
	expect(chatTurns.kind.notNull).toBe(true)
	expect(chatTurns.kind.hasDefault).toBe(false)
	expect(allMigrationsSql()).toContain(
		`CREATE TYPE "public"."chat_turn_kind" AS ENUM('private', 'podcast', 'chat_room', 'transcription', 'speech')`,
	)
	expect(allMigrationsSql()).toContain(`CREATE TYPE "public"."episode_speaker" AS ENUM('host', 'cohost')`)
	expect(allMigrationsSql()).toContain(
		`UPDATE "chat_turns" SET "kind" = 'chat_room' WHERE "room_message_id" IS NOT NULL`,
	)
	expect(allMigrationsSql()).toContain(`ALTER TABLE "chat_turns" ALTER COLUMN "kind" DROP DEFAULT`)
	expect(allMigrationsSql()).toMatch(/chat_turns_episode_id_episodes_id_fk.*ON DELETE cascade/)
})

// the checks: a room message id on a chat room row only and always, the podcast columns on a podcast row only and always,
// and no text on a chat room row or a voice spend row
test("chat_turns checks each kind's shape", () => {
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "chat_turns_chat_room_shape" CHECK (("chat_turns"."kind" = 'chat_room') = ("chat_turns"."room_message_id" is not null)`,
	)
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "chat_turns_podcast_shape" CHECK (("chat_turns"."kind" = 'podcast' and "chat_turns"."episode_id" is not null`,
	)
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "chat_turns_spend_shape" CHECK ("chat_turns"."kind" not in ('transcription', 'speech')`,
	)
})

// a chat proposal is a private chat's digest or a chat room's encrypted topic edit, one per user, topic, and team chat
// room
test("chat_proposals keeps a private digest or a chat room topic edit, unique per user, topic, and team chat room", () => {
	expect(chatProposals.digest.notNull).toBe(false)
	expect(chatProposals.teamId.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(
		`ADD CONSTRAINT "chat_proposals_page_unique" UNIQUE NULLS NOT DISTINCT("user_id","topic_id","team_id")`,
	)
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "chat_proposals_shape" CHECK (("chat_proposals"."team_id" is not null and`,
	)
	expect(allMigrationsSql()).toMatch(/chat_proposals_team_id_teams_id_fk.*ON DELETE cascade/)
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

// the file name of the initial migration, the first .sql file in sort order
function firstMigrationFile(): string {
	const sqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"))
	return sqlFiles.sort()[0] ?? ""
}

// every migration's SQL concatenated, for asserting on statements added after the initial migration
function allMigrationsSql(): string {
	const sqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"))
	return sqlFiles.map((file) => readFileSync(join(migrationsDirectory, file), "utf8")).join("\n")
}

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

// the chat room's chat messages are the team's conversation. it never reaches scoring, retrieval, or embeddings. the
// chat mention push reads a message's author, room, and reply reference, and never its text or a summary
test("room messages and summaries never reach the worker pipeline", () => {
	const readerFiles = listSourceFiles(["apps/worker", "packages/pipeline"]).filter((file) =>
		/chatRoomMessages|chatRoomSummaries/.test(file.text),
	)
	expect(readerFiles.map((file) => file.path)).toEqual(["packages/pipeline/pushNotify.ts"])
	expect(readerFiles.some((file) => /chatRoomMessages\.content|chatRoomSummaries/.test(file.text))).toBe(false)
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

// a deleted topic's podcast episodes keep their spend history, a deleted owner's episodes are deleted,
// and a scan has at most one episode
test("episodes keep their row on topic delete, cascade on owner delete, and are unique per scan and per topic, season, and number", () => {
	expect(podcastEpisodes.topicId.notNull).toBe(false)
	// the migration SQL holds the foreign keys and the unique indexes
	expect(allMigrationsSql()).toMatch(/episodes_topic_id_topics_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toMatch(/episodes_owner_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toContain(
		`CREATE UNIQUE INDEX "episodes_scan_unique" ON "episodes" USING btree ("scan_id")`,
	)
	expect(allMigrationsSql()).toContain(
		`CREATE UNIQUE INDEX "episodes_topic_season_number_unique" ON "episodes" USING btree ("topic_id","season","number")`,
	)
})

// a finding that a scan filters out is cleared from its chapter, and the chapter keeps its resource
test("episode_chapters clear a deleted finding, keep the resource, and are unique per position", () => {
	expect(podcastEpisodeChapters.findingId.notNull).toBe(false)
	expect(podcastEpisodeChapters.resourceId.notNull).toBe(true)
	expect(allMigrationsSql()).toMatch(/episode_chapters_finding_id_findings_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toContain(
		`CREATE UNIQUE INDEX "episode_chapters_episode_position_unique" ON "episode_chapters" USING btree ("episode_id","position")`,
	)
})

// a listen row is unique per episode and user, a feed token is unique per topic and user,
// and a topic's podcast is enabled by default
test("episode_listens are unique per episode and user, episode_feed_tokens per topic and user, and a topic's podcast defaults to on", () => {
	expect(allMigrationsSql()).toContain(
		`CREATE UNIQUE INDEX "episode_listens_episode_user_unique" ON "episode_listens" USING btree ("episode_id","user_id")`,
	)
	expect(allMigrationsSql()).toContain(
		`CREATE UNIQUE INDEX "episode_feed_tokens_topic_user_unique" ON "episode_feed_tokens" USING btree ("topic_id","user_id")`,
	)
	expect(allMigrationsSql()).toContain(`ADD COLUMN "is_podcast_enabled" boolean DEFAULT true NOT NULL`)
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

// a topic post goes with its topic and its author, and its comments, reactions, discussions, and image renders go
// with it. a draft has no publish time
test("topic_posts cascade from their topic and author, and their rows cascade from them", () => {
	expect(topicPosts.publishedAt.notNull).toBe(false)
	expect(topicPosts.version.notNull).toBe(true)
	expect(allMigrationsSql()).toMatch(/topic_posts_topic_id_topics_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/topic_posts_author_user_id_users_id_fk.*ON DELETE cascade/)

	// the rows that name a topic post
	expect(allMigrationsSql()).toMatch(/comments_post_id_topic_posts_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/reactions_post_id_topic_posts_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/topic_post_discussions_topic_post_id_topic_posts_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toMatch(/topic_image_renders_topic_post_id_topic_posts_id_fk.*ON DELETE cascade/)
})

// a discussion keeps its row if the user it billed closes their account, and reads by post and by user
test("topic_post_discussions null their billed user and index the post and the user", () => {
	expect(topicPostDiscussions.userId.notNull).toBe(false)
	expect(allMigrationsSql()).toMatch(/topic_post_discussions_user_id_users_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "topic_post_discussions_post_published_idx" ON "topic_post_discussions" USING btree ("topic_post_id","published_at")',
	)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "topic_post_discussions_user_kind_created_idx" ON "topic_post_discussions" USING btree ("user_id","kind","created_at")',
	)
})

// a mention is unseen while its seen time is null, the unseen ones are indexed by user, and the mentions from before
// the column count as seen
test("comment_mentions.seen_at is nullable, backfilled as seen, and indexed while null", () => {
	expect(commentMentions.seenAt.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(`UPDATE "comment_mentions" SET "seen_at" = now()`)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "comment_mentions_unseen_mentioned_user_id_idx" ON "comment_mentions" USING btree ("mentioned_user_id") WHERE "comment_mentions"."seen_at" is null',
	)
})

// comments and reactions store the topic of their social target, nullable so the release before it can still insert,
// backfilled from the target, and indexed with the time
test("comments and reactions store a nullable, backfilled, indexed target topic", () => {
	expect(comments.targetTopicId.notNull).toBe(false)
	expect(reactions.targetTopicId.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(`UPDATE "comments" SET "target_topic_id" = coalesce(`)
	expect(allMigrationsSql()).toContain(`UPDATE "reactions" SET "target_topic_id" = coalesce(`)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "comments_target_topic_created_at_idx" ON "comments" USING btree ("target_topic_id","created_at")',
	)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "reactions_target_topic_created_at_idx" ON "reactions" USING btree ("target_topic_id","created_at")',
	)
})

// a topic and a podcast episode hold a profile order beside their home order, each indexed where it is set
test("topics and episodes hold a nullable, indexed profile order", () => {
	expect(topics.profileOrder.notNull).toBe(false)
	expect(podcastEpisodes.profileOrder.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "topics_owner_profile_order_idx" ON "topics" USING btree ("owner_id","profile_order") WHERE "topics"."profile_order" is not null',
	)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "episodes_profile_order_idx" ON "episodes" USING btree ("profile_order") WHERE "episodes"."profile_order" is not null',
	)
})

// a Topic Post holds a home order and a profile order, each indexed where it is set
test("topic posts hold a nullable, indexed home order and profile order", () => {
	expect(topicPosts.homeOrder.notNull).toBe(false)
	expect(topicPosts.profileOrder.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "topic_posts_home_order_idx" ON "topic_posts" USING btree ("home_order") WHERE "topic_posts"."home_order" is not null',
	)
	expect(allMigrationsSql()).toContain(
		'CREATE INDEX "topic_posts_author_profile_order_idx" ON "topic_posts" USING btree ("author_user_id","profile_order") WHERE "topic_posts"."profile_order" is not null',
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

// a topic post chat turn is on a topic and no team, and only it names a topic post, which clears if the post is deleted
test("chat_turns checks the topic post kind's shape and clears a deleted post", () => {
	expect(chatTurns.topicPostId.notNull).toBe(false)
	expect(allMigrationsSql()).toMatch(/chat_turns_topic_post_id_topic_posts_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "chat_turns_topic_post_shape" CHECK (("chat_turns"."kind"::text <> 'topic_post' and "chat_turns"."topic_post_id" is null)`,
	)
})

// a settings row saved before these columns reads every new switch as off. each pause and the pinned-only home take
// false, and the generated chapter image limit takes no value, which reads as its default
test("the pauses and the pinned-only home in spend_control_settings default to false, and the generated chapter image limit is nullable with no default", () => {
	// each pause and the pinned-only home
	expect(spendControlSettings.isPodcastEpisodeRecordingPaused.notNull).toBe(true)
	expect(spendControlSettings.isPodcastEpisodeRecordingPaused.default).toBe(false)
	expect(spendControlSettings.isTopicPodcastEpisodeVideoRenderingPaused.notNull).toBe(true)
	expect(spendControlSettings.isTopicPodcastEpisodeVideoRenderingPaused.default).toBe(false)
	expect(spendControlSettings.isHomePinnedOnly.notNull).toBe(true)
	expect(spendControlSettings.isHomePinnedOnly.default).toBe(false)

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

// a migration waits on a table's lock for at most the lock timeout. the migrations before 0155 were written without it
test("every migration from 0155 on opens with the lock timeout", () => {
	const laterSqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql") && file >= "0155")
	expect(laterSqlFiles.length).toBeGreaterThan(0)
	for (const file of laterSqlFiles) {
		const firstLine = readFileSync(join(migrationsDirectory, file), "utf8").split("\n")[0]
		expect(`${file}: ${firstLine}`).toBe(`${file}: SET LOCAL lock_timeout = '3s';--> statement-breakpoint`)
	}
})

// a service rolled back one release still runs against the schema, so a migration that drops or renames says in its
// first comment that the previous release no longer reads what it removes. the migrations before 0169 were written
// without the comment
test("every migration from 0169 on that drops or renames says the previous release no longer reads it", () => {
	// a rename and a drop with no comment about the previous release are not safe to run
	const lockTimeoutLine = "SET LOCAL lock_timeout = '3s';--> statement-breakpoint"
	const renameSql = `${lockTimeoutLine}\nALTER TABLE "users" RENAME COLUMN "name" TO "full_name";`
	const dropSql = `${lockTimeoutLine}\n-- tidy up\nALTER TABLE "users" DROP COLUMN "name";`
	expect(isSafeForPreviousRelease(renameSql)).toBe(false)
	expect(isSafeForPreviousRelease(dropSql)).toBe(false)
	expect(isSafeForPreviousRelease(`${lockTimeoutLine}\nDROP TABLE "feeds";`)).toBe(false)

	// the same drop passes once its first comment says so, and a migration that only adds needs no comment
	const commentLine = `-- the previous release no longer reads users.name`
	expect(isSafeForPreviousRelease(`${lockTimeoutLine}\n${commentLine}\nALTER TABLE "users" DROP COLUMN "name";`)).toBe(
		true,
	)
	expect(isSafeForPreviousRelease(`${lockTimeoutLine}\nALTER TABLE "users" ADD COLUMN "nickname" text;`)).toBe(true)

	// every migration from this one on, named in the failure
	const laterSqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql") && file >= "0169")
	expect(laterSqlFiles.length).toBeGreaterThan(0)
	for (const file of laterSqlFiles) {
		const isSafe = isSafeForPreviousRelease(readFileSync(join(migrationsDirectory, file), "utf8"))
		expect(`${file}: ${isSafe}`).toBe(`${file}: true`)
	}
})

// whether a migration leaves the schema the previous release reads: it drops and renames nothing, or its first
// comment says the previous release no longer reads what it removes. a statement breakpoint is not a comment
function isSafeForPreviousRelease(migrationSql: string): boolean {
	if (!/\b(?:DROP COLUMN|DROP TABLE|RENAME)\b/i.test(migrationSql)) {
		return true
	}
	const firstComment = migrationSql.split("\n").find((line) => /^\s*--(?!>)/.test(line))
	return /previous release no longer reads/i.test(firstComment ?? "")
}
