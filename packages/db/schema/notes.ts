// the note tables: notes, their comment threads and comments, and when a user last opened one
import { sql } from "drizzle-orm"
import { boolean, check, customType, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { noteVisibility, primaryId, timestamps } from "./columns"
import { teams } from "./teams"
import { topics } from "./topics"
import { users } from "./users"

// the yjs document bytes column. postgres bytea, which drizzle has no built-in column for
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType() {
		return "bytea"
	},
	// the driver returns a Buffer, which is already a Uint8Array view
	fromDriver(value: Buffer): Uint8Array {
		return value
	},
	toDriver(value: Uint8Array): Buffer {
		return Buffer.from(value)
	},
})

// a note is one named rich-text note on a page, with a visibility: the topic page or the team page it lives on.
// the ydoc is the source of truth for content and comment threads, and the HTML is regenerated from it on save
export const notes = pgTable(
	"notes",
	{
		id: primaryId(),
		// the page, exactly one of the two. deleting the page takes every note with it
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
		// the note's name in the notes table, and who may see it
		name: text("name").notNull(),
		visibility: noteVisibility("visibility").notNull(),
		// the creator, who alone changes its visibility or deletes it. a private note is visible to this user only
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the yjs document bytes and the stored HTML the static state serves
		ydoc: bytea("ydoc").notNull(),
		html: text("html").notNull().default(""),
		// who wrote the last edit, so a user is never badged for their own
		lastEditorUserId: text("last_editor_user_id").references(() => users.id, { onDelete: "set null" }),
		// when the readable body last changed. updated_at also moves on a comment write and on the HTML regeneration
		bodyEditedAt: timestamp("body_edited_at", { withTimezone: true }),
		...timestamps(),
	},
	(table) => [
		// exactly one page, and one lookup per page
		check("notes_one_page", sql`(${table.topicId} is null) <> (${table.teamId} is null)`),
		index("notes_topic_id_idx").on(table.topicId),
		index("notes_team_id_idx").on(table.teamId),
	],
)

// the sql mirror of a note ydoc's comment threads, for counts and notifications. the ydoc stays the source of truth
export const noteCommentThreads = pgTable(
	"note_comment_threads",
	{
		// the thread id the ydoc's threads map uses
		id: text("id").primaryKey(),
		noteId: text("note_id")
			.notNull()
			.references(() => notes.id, { onDelete: "cascade" }),
		// whether the thread is resolved
		isResolved: boolean("is_resolved").notNull().default(false),
		...timestamps(),
	},
	(table) => [index("note_comment_threads_note_id_idx").on(table.noteId)],
)

// the sql mirror of one note comment. the body is the comment's blocknote json
export const noteComments = pgTable(
	"note_comments",
	{
		// the comment id the ydoc thread uses
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => noteCommentThreads.id, { onDelete: "cascade" }),
		// who wrote it. the row outlives a closed account
		authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
		body: jsonb("body"),
		// saved instead of deleting when the ui soft-deletes a comment
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		...timestamps(),
	},
	(table) => [index("note_comments_thread_id_idx").on(table.threadId)],
)

// when a user last opened a note. opening clears the note's unread edit and comment counts
export const noteReads = pgTable(
	"note_reads",
	{
		// the note and the user who opened it
		noteId: text("note_id")
			.notNull()
			.references(() => notes.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// restamped on every open. no row means the note was never opened, so all of it is unread
		readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one row per note and user, plus the by-user index
	(table) => [primaryKey({ columns: [table.noteId, table.userId] }), index("note_reads_user_id_idx").on(table.userId)],
)
