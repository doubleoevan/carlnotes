// tests that pin the shape of the domain schema and the migration SQL that creates it
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import * as schema from "./schema"
import { findings, resources, sources, subscriptions, topics } from "./schema"

// read the generated initial migration once for SQL-level assertions
const migrationsDirectory = join(import.meta.dir, "migrations")
const initialSql = readFileSync(join(migrationsDirectory, firstMigrationFile()), "utf8")

// ingestion inserts a Resource before the pipeline embeds it, so both embedding columns must be nullable
test("embedding and embedding_model are nullable", () => {
	expect(resources.embedding.notNull).toBe(false)
	expect(resources.embeddingModel.notNull).toBe(false)
})

// the embedding vector is migrated to 1024 dimensions for qwen3-embedding-8b. a dimension change is a schema migration plus a re-embed backfill
test("the embedding column is migrated to a 1024-dim vector", () => {
	expect(allMigrationsSql()).toContain("vector(1024)")
})

// a topic feed has no table. it gets built from a topic's findings at runtime.
test("no feeds table or export exists", () => {
	expect("feeds" in schema).toBe(false)
	expect(initialSql).not.toContain('CREATE TABLE "feeds"')
})

// tags are Topic metadata with an empty default, so existing rows need no backfill. tags are never a separate entity and resources and findings stay untagged
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

// the near-duplicate gate's nearest-neighbor lookup must be index-backed, and cosine, since that is the distance it measures
test("an HNSW cosine index covers resources.embedding", () => {
	expect(allMigrationsSql()).toContain(
		`CREATE INDEX "resources_embedding_hnsw" ON "resources" USING hnsw ("embedding" vector_cosine_ops)`,
	)
})

// a source without an api key needs no Integration, so the integration_id must be nullable
test("sources.integration_id is nullable", () => {
	expect(sources.integrationId.notNull).toBe(false)
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

// resource content moves to object storage behind a key. the legacy content column is not dropped in this change
test("resources content_key and content_bytes are nullable and content is not dropped", () => {
	expect(resources.contentKey.notNull).toBe(false)
	expect(resources.contentBytes.notNull).toBe(false)
	expect("content" in resources).toBe(true)
	expect(allMigrationsSql()).toContain(`ADD COLUMN "content_key" text`)
})

// a Subscription's subscriber is a user or an audience, so both columns exist and are mutually exclusive
test("a subscription exposes both subscriber columns with a mutual exclusion check", () => {
	expect(subscriptions.subscriberUserId).toBeDefined()
	expect(subscriptions.subscriberAudienceId).toBeDefined()
	expect(initialSql).toContain("subscriptions_subscriber_xor")
	// assert the real xor expression, not just the constraint name, so a malformed CHECK can't pass
	expect(initialSql).toMatch(/subscriber_user_id.* <> .*subscriber_audience_id/)
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

// the billing plan is a proper pgEnum, unlike role, since it carries no external-library constraint
test("users.plan is a free/plus/premium enum, non-null, and defaults to free", () => {
	expect(schema.users.plan.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`CREATE TYPE "public"."plan" AS ENUM('free', 'plus', 'premium')`)
	expect(allMigrationsSql()).toContain(`"plan" "plan" DEFAULT 'free' NOT NULL`)
})

// a billing subscription mirrors a user's active Stripe subscription and derives their plan. one active row per user, cascading with the user
test("billing_subscriptions is one-per-user, cascades, and carries the Stripe, plan, and card columns", () => {
	expect("billingSubscriptions" in schema).toBe(true)
	expect(schema.billingSubscriptions.hasPaymentMethod.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`CONSTRAINT "billing_subscriptions_user_id_unique" UNIQUE("user_id")`)
	expect(allMigrationsSql()).toMatch(/billing_subscriptions_user_id_users_id_fk.*ON DELETE cascade/)
	expect(allMigrationsSql()).toContain(`"has_payment_method" boolean DEFAULT false NOT NULL`)
})

// the per-user budget override is nullable, since a null means the plan's own monthly backstop applies
test("users.budget_override_cents is a nullable integer", () => {
	expect(schema.users.budgetOverrideCents.notNull).toBe(false)
	expect(allMigrationsSql()).toContain(`ADD COLUMN "budget_override_cents" integer`)
})

// the kept-set size is constrained to the shared allowed values, and the default doubles as the migration backfill
test("topics.max_results defaults to ten and is checked against the allowed sizes", () => {
	expect(schema.topics.maxResults.notNull).toBe(true)
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

// an ingester that captures no engagement value leaves the column null
test("resources.engagement is nullable", () => {
	expect(resources.engagement.notNull).toBe(false)
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
