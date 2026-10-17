// the chat tables: chat turns and their attachments, chat proposals, the chat rooms' messages, mentions, summaries,
// and files, the link previews, and the docs sections retrieved into chat
import {
	bigint,
	boolean,
	index,
	integer,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	vector,
} from "drizzle-orm/pg-core"
import { attachmentStatus, chatAttachmentKind, primaryId, timestamps } from "./columns"
import { EMBED_DIMENSIONS } from "./scans"
import { teams } from "./teams"
import { topics } from "./topics"
import { users } from "./users"

// a chat turn is one question and its reply
export const chatTurns = pgTable(
	"chat_turns",
	{
		id: primaryId(),
		// who asked
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic the chat turn is about. null on a team chat room's turn, which names the team instead,
		// and on a new-topic chat turn, where no topic exists yet
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		// the team whose own chat room billed the chat turn, so team spend still counts it. null on a topic chat turn
		// and on a new-topic chat turn, which is one user's alone
		teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
		// what the chat turn cost, in the same dollars scans record, summed into the user's monthly spend
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// the chat turn's text, stored only when the gate grants the sender chat:persist
		question: text("question"),
		answer: text("answer"),
		// the tools the chat turn called, stored encrypted beside its text
		toolCalls: text("tool_calls"),
		// the chat room message this turn answered, for a chat room completion. null on a private chat turn
		roomMessageId: bigint("room_message_id", { mode: "number" }),
		// what the completion spent in tokens, kept beside the cost it produced
		totalTokens: integer("total_tokens"),
		// whether the question was spoken and its reply read aloud. a voice spend row stays false
		isSpoken: boolean("is_spoken").notNull().default(false),
		// when the chat turn ran. the monthly spend sum uses it and the chat messages replay in its order
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// covers a user's persisted conversation read by topic and time, and the monthly spend sum by user and time
	(table) => [
		index("chat_turns_topic_created_idx").on(table.topicId, table.createdAt),
		index("chat_turns_team_created_idx").on(table.teamId, table.createdAt),
		index("chat_turns_user_created_idx").on(table.userId, table.createdAt),
	],
)

// the change carl previewed in a private chat turn, kept until the user's next message on that page answers it.
// the row holds a keyed digest of the preview and no words of it, so a conversation that is not persisted keeps
// nothing readable here
export const chatProposals = pgTable(
	"chat_proposals",
	{
		id: primaryId(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic the preview would change. null on the new-topic chat, whose preview is the topic draft
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		// the chat turn that showed the preview
		chatTurnId: text("chat_turn_id")
			.notNull()
			.references(() => chatTurns.id, { onDelete: "cascade" }),
		digest: text("digest").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one preview per user per chat page. nulls compare equal here so the new-topic chat's upsert finds its row
	(table) => [unique("chat_proposals_page_unique").on(table.userId, table.topicId).nullsNotDistinct()],
)

// an attachment a user sent with a chat turn, whether or not they kept it for the topic
export const chatAttachments = pgTable(
	"chat_attachments",
	{
		id: primaryId(),
		// who sent it, and for which topic's conversation. either deletion takes the attachment with it
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the chat turn it was sent with, which shows it again in that question's bubble
		chatTurnId: text("chat_turn_id").references(() => chatTurns.id, { onDelete: "set null" }),
		// whether the user kept it. a kept attachment counts against the keep limit and carl reads it on later chat turns
		isKept: boolean("is_kept").notNull().default(true),
		kind: chatAttachmentKind("kind").notNull(),
		name: text("name").notNull(),
		// where an image or PDF's original bytes live in object storage. null for text, which has no file
		objectKey: text("object_key"),
		contentType: text("content_type"),
		byteSize: integer("byte_size"),
		// a kept paste or text file's own words, encrypted like a chat turn's text
		rawText: text("raw_text"),
		// the summary that is included in every future chat turn, generated once. empty until the background job finishes
		context: text("context").notNull().default(""),
		status: attachmentStatus("status").notNull().default("pending"),
		error: text("error"),
		...timestamps(),
	},
	// the read path always filters by exactly this pair
	(table) => [index("chat_attachments_user_topic_idx").on(table.userId, table.topicId)],
)

// a file a member shared with the chat room. the uploader clears on account deletion and a leader may still delete it
export const chatRoomAttachments = pgTable(
	"room_attachments",
	{
		id: primaryId(),
		// the chat room the file belongs to, and the message it came with. a message may share several, each its own row
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		messageId: bigint("message_id", { mode: "number" }).notNull(),
		// who shared it, and the name recorded at post time, which outlives the account
		uploaderUserId: text("uploader_user_id").references(() => users.id, { onDelete: "set null" }),
		uploaderUsername: text("uploader_username").notNull(),
		kind: chatAttachmentKind("kind").notNull(),
		name: text("name").notNull(),
		// where an image or PDF's original bytes live in object storage. null for shared text, which has no file
		objectKey: text("object_key"),
		contentType: text("content_type"),
		byteSize: integer("byte_size"),
		// what carl reads on every chat room turn: the document's words or the described image,
		// encrypted like the chat messages
		context: text("context").notNull().default(""),
		status: attachmentStatus("status").notNull().default("pending"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// the chat room turn and the chat messages both read one chat room's files at once
	(table) => [index("room_attachments_topic_id_idx").on(table.topicId)],
)

// one message in a team topic's shared chat room.
// the id is an ordered bigint so a stream reconnect resumes from a cursor
export const chatRoomMessages = pgTable(
	"room_messages",
	{
		id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		// the topic whose chat room this is, and the team whose members are in it.
		// a null topic is the team's own chat room on its team page
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		// who wrote it, and the name recorded at post time
		authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
		authorUsername: text("author_username").notNull(),
		// the message this one answers, which is how a reply to carl continues without a fresh chat mention
		replyToMessageId: bigint("reply_to_message_id", { mode: "number" }),
		// the message text, encrypted at the application layer like the private chat's messages
		content: text("content").notNull(),
		// whether the message was spoken, set on a member's spoken message and on carl's reply to it
		isSpoken: boolean("is_spoken").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// the stream and the chat messages both read one chat room in id order
	(table) => [index("room_messages_topic_id_idx").on(table.topicId, table.teamId, table.id)],
)

// who a chat room message mentioned or replied to, extracted at write time, where the content itself is encrypted
export const chatRoomMentions = pgTable(
	"room_mentions",
	{
		// the message and the member it named
		messageId: bigint("message_id", { mode: "number" })
			.notNull()
			.references(() => chatRoomMessages.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// saved when the member loads the chat room, which clears the badge. null is unseen
		seenAt: timestamp("seen_at", { withTimezone: true }),
	},
	// one row per message and member, plus the by-user lookup the chat mention badges read,
	// where the key starts with message
	(table) => [
		primaryKey({ columns: [table.messageId, table.userId] }),
		index("room_mentions_user_id_idx").on(table.userId),
	],
)

// one running summary per chat room, holding what rolled out of the context window and how far it reaches
export const chatRoomSummaries = pgTable(
	"room_summaries",
	{
		id: primaryId(),
		// the chat room is a topic and the team whose members talk in it. a null topic is the team's own chat room
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		summary: text("summary").notNull(),
		// the last message id the summary covers, so the window starts after it
		summarizedThroughMessageId: bigint("summarized_through_message_id", { mode: "number" }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one summary per chat room. nulls compare equal here so the team chat room's upsert finds its row
	(table) => [unique("room_summaries_room_unique").on(table.topicId, table.teamId).nullsNotDistinct()],
)

// one link's fetched link preview, keyed by its normalized url so the same link in many chat rooms is fetched once
export const linkPreviews = pgTable(
	"link_previews",
	{
		id: primaryId(),
		// the normalized url this link preview describes
		url: text("url").notNull().unique(),
		// the page's own title and description, encrypted like the message the url was pasted into
		title: text("title"),
		description: text("description"),
		// where the page's proxied image lives in object storage
		imageObjectKey: text("image_object_key"),
		imageContentType: text("image_content_type"),
		// ready holds a fetched link preview. failed records a url that could not be previewed, which stops it being refetched on every post
		status: attachmentStatus("status").notNull(),
		// the team whose message paid for the fetch
		fetchedByTeamId: text("fetched_by_team_id").references(() => teams.id, { onDelete: "set null" }),
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// the hourly limit counts one team's recent fetches
	(table) => [index("link_previews_team_fetched_idx").on(table.fetchedByTeamId, table.fetchedAt)],
)

// one embedded section of the documentation, retrieved into chat when a question asks about the app
export const docsChunks = pgTable(
	"docs_chunks",
	{
		id: primaryId(),
		// the docs page and section heading the words came from
		page: text("page").notNull(),
		heading: text("heading").notNull(),
		content: text("content").notNull(),
		// the content's hash, so the sync only re-embeds what changed
		contentHash: text("content_hash").notNull(),
		embedding: vector("embedding", { dimensions: EMBED_DIMENSIONS }).notNull(),
		embeddingModel: text("embedding_model").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [unique("docs_chunks_page_heading_unique").on(table.page, table.heading)],
)
