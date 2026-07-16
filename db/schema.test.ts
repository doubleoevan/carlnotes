// structural self-checks for the domain schema: assert the invariants a later change could silently break

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

// the embedding vector is fixed at 768 dims (BGE/GTE class); a model swap is a backfill, not a schema change
test("the embedding column is a 768-dim vector", () => {
	expect(initialSql).toContain('"embedding" vector(768)')
})

// Feed is a route over a topic's findings, never a table
test("no feeds table or export exists", () => {
	expect("feeds" in schema).toBe(false)
	expect(initialSql).not.toContain('CREATE TABLE "feeds"')
})

// tags are Topic metadata with an empty default (so existing rows need no backfill), never a separate entity, and Resources/Findings stay untagged
test("topics.tags is a non-null, empty-default column and tags is not an entity", () => {
	expect(topics.tags.notNull).toBe(true)
	expect(allMigrationsSql()).toContain(`"tags" text[] DEFAULT '{}' NOT NULL`)
	expect("tags" in schema).toBe(false)
	expect("tags" in resources).toBe(false)
	expect("tags" in findings).toBe(false)
})

// tag containment/overlap filters must be index-backed, so the named GIN index covers topics.tags
test("a GIN index covers topics.tags", () => {
	expect(allMigrationsSql()).toContain(`CREATE INDEX "topics_tags_gin" ON "topics" USING gin ("tags")`)
})

// a keyless Source (RSS) needs no Integration, so integration_id must be nullable
test("sources.integration_id is nullable", () => {
	expect(sources.integrationId.notNull).toBe(false)
})

// a Subscription's subscriber is a user or an audience, so both columns exist and a CHECK enforces the xor
test("a subscription exposes both subscriber columns under an xor check", () => {
	expect(subscriptions.subscriberUserId).toBeDefined()
	expect(subscriptions.subscriberAudienceId).toBeDefined()
	expect(initialSql).toContain("subscriptions_subscriber_xor")
	// assert the real xor expression, not just the constraint name, so a malformed CHECK can't pass
	expect(initialSql).toMatch(/subscriber_user_id.* <> .*subscriber_audience_id/)
})

// pgvector must be enabled before the resources table that uses vector(768) is created
test("the initial migration enables pgvector before the vector column", () => {
	expect(initialSql).toContain("CREATE EXTENSION IF NOT EXISTS vector")
	expect(initialSql.indexOf("CREATE EXTENSION IF NOT EXISTS vector")).toBeLessThan(initialSql.indexOf("vector(768)"))
})

// the single 0000_*.sql migration file name
function firstMigrationFile(): string {
	const sqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"))
	return sqlFiles.sort()[0] ?? ""
}

// every migration's SQL concatenated, for asserting on statements added after the initial migration
function allMigrationsSql(): string {
	const sqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"))
	return sqlFiles.map((file) => readFileSync(join(migrationsDirectory, file), "utf8")).join("\n")
}
