// the note tables: notes, their comments, and when a user last opened one
import { sql } from "drizzle-orm"
import { check, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { noteVisibility, primaryId, timestamps } from "./columns"
import { teams } from "./teams"
import { topics } from "./topics"
import { users } from "./users"

// a note is one named rich-text note on a page, with a visibility: the topic page or the team page it lives on.
// the sanitized HTML is the body's one copy, and the version is what a save names
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
		// the sanitized HTML body, empty until somebody writes, and the version a save that changes the body raises
		html: text("html").notNull().default(""),
		version: integer("version").notNull().default(1),
		// who wrote the last edit, so a user is never badged for their own
		lastEditorUserId: text("last_editor_user_id").references(() => users.id, { onDelete: "set null" }),
		// when the body last changed. updated_at also moves on a rename or a visibility change
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

// one comment on a note's thread, plain text. deleting the note takes its comments with it
export const noteComments = pgTable(
	"note_comments",
	{
		id: primaryId(),
		noteId: text("note_id")
			.notNull()
			.references(() => notes.id, { onDelete: "cascade" }),
		// who wrote it. the row outlives a closed account with no author
		authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
		body: text("body").notNull(),
		...timestamps(),
	},
	// the thread in order, and the unread count's read, both by note
	(table) => [index("note_comments_note_id_created_at_idx").on(table.noteId, table.createdAt)],
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
