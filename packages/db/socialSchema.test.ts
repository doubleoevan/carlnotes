// tests that pin the shape of the social tables: Topic Posts, their discussions, comments, reactions, and mentions
import { expect, test } from "bun:test"
import { commentMentions, comments, reactions } from "./schema/social"
import { topicPostDiscussions, topicPosts } from "./schema/topicPosts"
import { allMigrationsSql } from "./schemaTestFixtures"

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
