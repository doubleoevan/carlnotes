// the Topic tables: topics, drafts, sources, attachments, prompt versions, subscriptions, and the emails a Topic sent

import { maxTopicFindingsOptions } from "@shared/enums"
import type { TopicDraft } from "@shared/topicPayloads"
import { sql } from "drizzle-orm"
import { boolean, check, index, integer, jsonb, pgTable, text, time, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import {
	attachmentStatus,
	dayOfWeek,
	frequency,
	primaryId,
	promptVersionOrigin,
	sourceKind,
	sourceStatus,
	timestamps,
	visibility,
} from "./columns"
import { scans } from "./scans"
import { teams } from "./teams"
import { users } from "./users"

// a topic is the user's configuration of what to scan for
export const topics = pgTable(
	"topics",
	{
		id: primaryId(),
		// the owner
		ownerId: text("owner_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic name and the prompt that the pipeline scores against
		name: text("name").notNull(),
		prompt: text("prompt").notNull().default(""),
		// how often to scan, and who may see the topic feed
		frequency: frequency("frequency").notNull().default("daily"),
		// the time of day a scan runs. stored as HH:MM:SS, the format drizzle's time column returns
		scheduledTime: time("scheduled_time").notNull().default("09:00:00"),
		// the day a weekly scan runs on. ignored for every other frequency
		scheduledDayOfWeek: dayOfWeek("scheduled_day_of_week").notNull().default("monday"),
		visibility: visibility("visibility").notNull().default("private"),
		// the team that holds this topic, or null for a topic on no team
		teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
		// free-form category labels, empty by default
		tags: text("tags").array().notNull().default([]),
		// an admin can feature this topic and set its order
		featureOrder: integer("feature_order"),
		// how many findings a scan keeps for this topic, one of the shared allowed sizes
		maxTopicFindings: integer("max_results").notNull().default(10),
		// the unique subscriber count for the topic's active subscribers, not including the owner
		subscriberCount: integer("subscriber_count").notNull().default(0),
		// whether the owner has the topic's podcast on
		isPodcastEnabled: boolean("is_podcast_enabled").notNull().default(true),
		// created and updated timestamps
		...timestamps(),
	},
	// the generalized inverted index for topic tag filtering, and the allowed kept-set sizes
	(table) => [
		index("topics_tags_gin").using("gin", table.tags),
		// the trigram index behind the topic name search, which matches anywhere in the lowercased name
		index("topics_name_lower_trgm").using("gin", sql`lower(${table.name}) gin_trgm_ops`),
		// covers the owner and team topic lists
		index("topics_owner_id_idx").on(table.ownerId),
		index("topics_team_id_idx").on(table.teamId),
		check("topics_max_results_allowed", sql.raw(`max_results in (${maxTopicFindingsOptions.join(", ")})`)),
	],
)

// the new-topic chat's draft, one per user, so it survives a reload
export const topicDrafts = pgTable("topic_drafts", {
	userId: text("user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	topicDraft: jsonb("topic_draft").$type<TopicDraft>().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

// a source is a topic input that scans pull resources from
export const sources = pgTable(
	"sources",
	{
		id: primaryId(),
		// the topic this source feeds
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the source kind: url, rss, reddit, YouTube, podcast, search, bluesky, x, composio, or plugin
		kind: sourceKind("kind").notNull(),
		config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
		// the async screening status and its failure reason
		status: sourceStatus("status").notNull().default("pending"),
		error: text("error"),
		// created and updated timestamps
		...timestamps(),
	},
	// the feed build and the topic page read a topic's sources by its id
	(table) => [index("sources_topic_id_idx").on(table.topicId)],
)

// an attachment is a file or url that adds context to a topic
export const attachments = pgTable(
	"attachments",
	{
		id: primaryId(),
		// the topic this attachment adds context to
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// where the raw file lives in object storage, plus its original name, type, and size
		objectKey: text("object_key").notNull(),
		filename: text("filename").notNull(),
		contentType: text("content_type").notNull(),
		byteSize: integer("byte_size").notNull(),
		// the context the processing workflow fills once the attachment is ready. empty until then
		context: text("context").notNull().default(""),
		// the async processing status, its failure reason, and the extracted length and chunk fan-out
		status: attachmentStatus("status").notNull().default("pending"),
		error: text("error"),
		charCount: integer("char_count"),
		chunkCount: integer("chunk_count"),
		// origin URL for a URL-ingested attachment. null for file uploads
		sourceUrl: text("source_url"),
		// created and updated timestamps
		...timestamps(),
	},
	// the feed build and the topic page read a topic's attachments by its id
	(table) => [index("attachments_topic_id_idx").on(table.topicId)],
)

// a prompt version is one saved text of a topic's prompt. every save appends one, and rows are never updated
export const topicPromptVersions = pgTable(
	"topic_prompt_versions",
	{
		id: primaryId(),
		// the topic whose prompt this is
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the prompt text as saved
		prompt: text("prompt").notNull(),
		// who saved it. null once that account closes
		savedByUserId: text("saved_by_user_id").references(() => users.id, { onDelete: "set null" }),
		// where the save came from: editor, chat, or mcp
		origin: promptVersionOrigin("origin").notNull(),
		// when it was saved. the time order is the history
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// covers a topic's history read newest first
	(table) => [index("topic_prompt_versions_topic_created_idx").on(table.topicId, table.createdAt)],
)

// a subscription maps a topic to its subscribing user
export const subscriptions = pgTable(
	"subscriptions",
	{
		id: primaryId(),
		// the topic being subscribed to
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the subscribing user. a team reaches a topic through its members' own rows, never a row of its own
		subscriberUserId: text("subscriber_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// unsubscribing toggles is_active off and keeps the row. only an explicit delete removes it
		isActive: boolean("is_active").notNull().default(true),
		// email cascades off whenever active turns off. it does not cascade back on when active does
		isEmailEnabled: boolean("is_email_enabled").notNull().default(true),
		// delivery preference for this subscriber
		frequency: frequency("frequency").notNull().default("daily"),
		// created and updated timestamps
		...timestamps(),
	},
	// one row per user and topic
	(table) => [
		uniqueIndex("subscriptions_topic_subscriber_unique").on(table.topicId, table.subscriberUserId),
		index("subscriptions_subscriber_active_idx").on(table.subscriberUserId, table.isActive),
	],
)

// an email that a topic sent that resend accepted to be tracked by the admin page
export const topicEmailSends = pgTable(
	"topic_email_sends",
	{
		id: primaryId(),
		// the topic the email was about
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// who received the email, null for an invitee with no account yet
		recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
		// which kind of email went out: topic-scan, manual-scan, or topic-invite
		emailKind: text("email_kind").notNull(),
		// the Scan that sent the email. null for an invite, and for a scan email older than this column
		scanId: text("scan_id").references(() => scans.id, { onDelete: "set null" }),
		sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one row per Scan and recipient, so a retried send is recorded once. rows without a Scan never collide
	(table) => [uniqueIndex("topic_email_sends_scan_recipient_unique").on(table.scanId, table.recipientUserId)],
)
