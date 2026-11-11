// the topic post tables: a topic's posts and the recorded discussions of them
import type { PodcastEpisodeTurn } from "@carlnotes/contracts/payloads"
import { sql } from "drizzle-orm"
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { primaryId, timestamps, topicImageOrigin, topicPostDiscussionKind, topicPostDiscussionStatus } from "./columns"
import { topics } from "./topics"
import { users } from "./users"

// one long-form post on a topic by its owner or a member of a team that holds it. a draft until it is published
export const topicPosts = pgTable(
	"topic_posts",
	{
		id: primaryId(),
		// the topic and the author. deleting the topic or closing the author's account takes the post with it
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the title, empty until the author writes one
		title: text("title").notNull().default(""),
		// the sanitized HTML body, the count of the words in its text, and the version a save that changes it raises
		html: text("html").notNull().default(""),
		wordCount: integer("word_count").notNull().default(0),
		version: integer("version").notNull().default(1),
		// when the post was published, null for a draft, and when its author last edited it after that
		publishedAt: timestamp("published_at", { withTimezone: true }),
		editedAt: timestamp("edited_at", { withTimezone: true }),
		// the summary a model wrote on publishing, null until it is written, and what writing it cost in dollars
		summary: text("summary"),
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// the content hash of the post's image, null until it is drawn, where the image came from, the editor's image
		// prompt that the last render followed, and when the image last changed
		imageHash: text("image_hash"),
		imageOrigin: topicImageOrigin("image_origin"),
		imagePrompt: text("image_prompt"),
		imageUpdatedAt: timestamp("image_updated_at", { withTimezone: true }),
		// an admin can pin this post to the home page and set its order
		homeOrder: integer("home_order"),
		// the author can pin this post to the top of their profile page and set its order
		profileOrder: integer("profile_order"),
		// created and updated timestamps
		...timestamps(),
	},
	// covers a topic's posts and an author's posts, both newest first, the posts of every topic published since a
	// time, the home's pinned posts in their order, and one author's pinned posts in their order
	(table) => [
		index("topic_posts_topic_published_idx").on(table.topicId, table.publishedAt),
		index("topic_posts_author_published_idx").on(table.authorUserId, table.publishedAt),
		index("topic_posts_published_at_idx").on(table.publishedAt),
		index("topic_posts_home_order_idx").on(table.homeOrder).where(sql`${table.homeOrder} is not null`),
		index("topic_posts_author_profile_order_idx")
			.on(table.authorUserId, table.profileOrder)
			.where(sql`${table.profileOrder} is not null`),
	],
)

// one recording of the podcast's two speakers discussing a topic post
export const topicPostDiscussions = pgTable(
	"topic_post_discussions",
	{
		id: primaryId(),
		// the post it discusses, which takes the recording with it
		topicPostId: text("topic_post_id")
			.notNull()
			.references(() => topicPosts.id, { onDelete: "cascade" }),
		// the user the recording bills: the post's publisher, or whoever regenerated it
		userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
		kind: topicPostDiscussionKind("kind").notNull(),
		// the recording status. recording until it publishes or fails, and error holds a failure reason
		status: topicPostDiscussionStatus("status").notNull().default("recording"),
		error: text("error"),
		// the script that passed its checks, as the turns the two speakers say
		script: jsonb("script").$type<PodcastEpisodeTurn[]>(),
		// the stored audio's object key, its byte size, and its length in seconds
		audioKey: text("audio_key"),
		audioByteSize: integer("audio_byte_size"),
		durationSeconds: integer("duration_seconds"),
		// the speech model that recorded it, and what the script and the speech cost in dollars
		model: text("model"),
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// when the recording started and when it published
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		publishedAt: timestamp("published_at", { withTimezone: true }),
	},
	// covers a post's newest published recording, and a user's regeneration count and monthly spend sum. a post has
	// one recording under way at a time
	(table) => [
		index("topic_post_discussions_post_published_idx").on(table.topicPostId, table.publishedAt),
		index("topic_post_discussions_user_kind_created_idx").on(table.userId, table.kind, table.createdAt),
		uniqueIndex("topic_post_discussions_post_recording_unique")
			.on(table.topicPostId)
			.where(sql`${table.status} = 'recording'`),
	],
)
