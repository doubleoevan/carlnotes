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

// the embedding vector is fixed at 768 dimensions to match the planned embedding models. swapping models is a backfill, not a schema change
test("the embedding column is a 768-dim vector", () => {
	expect(initialSql).toContain('"embedding" vector(768)')
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

// a source without an api key needs no Integration, so the integration_id must be nullable
test("sources.integration_id is nullable", () => {
	expect(sources.integrationId.notNull).toBe(false)
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
