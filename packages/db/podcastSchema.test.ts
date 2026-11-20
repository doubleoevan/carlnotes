// tests that pin the shape of the podcast episode tables and the profile order of topics and podcast episodes
import { expect, test } from "bun:test"
import { podcastEpisodeChapters, podcastEpisodes } from "./schema/podcast"
import { topics } from "./schema/topics"
import { allMigrationsSql } from "./schemaTestFixtures"

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
