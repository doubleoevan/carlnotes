// tests that pin the shape of the chat tables, and that the chat room's messages stay out of the worker pipeline
import { expect, test } from "bun:test"
import { listSourceFiles } from "@carlnotes/server/sourceFileTestFixtures"
import { chatProposals, chatRoomMessages, chatTurns } from "./schema/chat"
import { allMigrationsSql } from "./schemaTestFixtures"

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

// the chat room's chat messages are the team's conversation. it never reaches scoring, retrieval, or embeddings. the
// chat mention push reads a message's author, room, and reply reference, and never its text or a summary
test("room messages and summaries never reach the worker pipeline", () => {
	const readerFiles = listSourceFiles(["apps/worker", "packages/pipeline"]).filter((file) =>
		/chatRoomMessages|chatRoomSummaries/.test(file.text),
	)
	expect(readerFiles.map((file) => file.path)).toEqual(["packages/pipeline/pushNotify.ts"])
	expect(readerFiles.some((file) => /chatRoomMessages\.content|chatRoomSummaries/.test(file.text))).toBe(false)
})

// a topic post chat turn is on a topic and no team, and only it names a topic post, which clears if the post is deleted
test("chat_turns checks the topic post kind's shape and clears a deleted post", () => {
	expect(chatTurns.topicPostId.notNull).toBe(false)
	expect(allMigrationsSql()).toMatch(/chat_turns_topic_post_id_topic_posts_id_fk.*ON DELETE set null/)
	expect(allMigrationsSql()).toContain(
		`CONSTRAINT "chat_turns_topic_post_shape" CHECK (("chat_turns"."kind"::text <> 'topic_post' and "chat_turns"."topic_post_id" is null)`,
	)
})
