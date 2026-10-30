// the note contracts: a note, a page's notes, an opened note with its body and version, a save's results, a comment,
// and the badges
import { z } from "zod"
import { noteVisibilities } from "./enums"
import { profileIdentity, userIdentity } from "./profiles"

// one note's unread counts for the signed-in user
export const noteBadge = z.object({
	noteId: z.string(),
	// the page the note sits on, exactly one of the two
	topicId: z.string().nullable(),
	teamId: z.string().nullable(),
	// every team the page belongs to, so a team badge counts its topics' notes as well as its own
	teamIds: z.array(z.string()),
	// the note's own name, and the topic or team holding it, both named in the badge's tooltip
	noteName: z.string(),
	pageName: z.string(),
	// 1 when somebody else changed the body since the user last opened it, however many edits it took
	unreadEdits: z.number(),
	// the comments written since then by somebody else
	unreadComments: z.number(),
})

export type NoteBadge = z.infer<typeof noteBadge>

// the badges payload: only the notes with unread edits or comments
export const noteBadgesResponse = z.object({ badges: z.array(noteBadge) })

export type NoteBadgesResponse = z.infer<typeof noteBadgesResponse>

// the longest HTML body a note keeps. the save route's own body limit admits any UTF-8 encoding of a string this long
export const NOTE_HTML_MAX_CHARS = 512 * 1024

// the longest comment a note takes
export const NOTE_COMMENT_MAX_CHARS = 2000

// the longest name a note takes
export const NOTE_NAME_MAX_CHARS = 120

// the visibility values a note can use
export type NoteVisibility = (typeof noteVisibilities)[number]

// the table's note summary with the server's current permissions
export const note = z.object({
	id: z.string(),
	name: z.string(),
	visibility: z.enum(noteVisibilities),
	createdAt: z.string(),
	updatedAt: z.string(),
	canEdit: z.boolean(),
	// whether the user created it, which alone allows changing its visibility
	isNoteOwner: z.boolean(),
	// whether the user may delete it: its owner, or an admin
	canDelete: z.boolean(),
	// who created it. null once the account closed
	owner: userIdentity.nullable(),
})

export type Note = z.infer<typeof note>

// the notes payload for one page
export const notesResponse = z.object({
	// the page's display name, substituted into the empty state
	pageName: z.string(),
	// the visibilities the user may create a note in. empty for a visitor
	creatableVisibilities: z.array(z.enum(noteVisibilities)),
	notes: z.array(note),
})

export type NotesResponse = z.infer<typeof notesResponse>

// one note opened in its dialog: the stored HTML body, which the editor and the reader both render, and the version
// the next save names
export const noteResponse = note.extend({ html: z.string(), version: z.number() })

export type NoteResponse = z.infer<typeof noteResponse>

// a save the api kept: the version the body is stored at now
export const noteBodyResponse = z.object({ version: z.number() })

export type NoteBodyResponse = z.infer<typeof noteBodyResponse>

// a save that lost to a newer version: the version stored now and who saved it, null for a closed account
const noteConflict = z.object({ version: z.number(), lastEditorUsername: z.string().nullable() })

export type NoteConflict = z.infer<typeof noteConflict>

// the 409 body of a lost save
export const noteBodyConflictResponse = noteConflict.extend({ error: z.literal("conflict") })

export type NoteBodyConflictResponse = z.infer<typeof noteBodyConflictResponse>

// how a body save ended: kept at a version or lost to a newer one, which the api decides, or too large for the api
// to keep or never arrived, which the api client reports
export type NoteBodySaveResult =
	| { status: "saved"; version: number }
	| ({ status: "conflict" } & NoteConflict)
	| { status: "tooLarge" }
	| { status: "unavailable" }
	| { status: "failed" }

// one comment on a note's thread. a closed account leaves no author
export const noteComment = z.object({
	id: z.string(),
	body: z.string(),
	createdAt: z.string(),
	author: profileIdentity.nullable(),
	// whether the user may delete it: its author
	canDelete: z.boolean(),
})

export type NoteComment = z.infer<typeof noteComment>

// the comment thread payload, oldest first
export const noteCommentsResponse = z.object({ comments: z.array(noteComment) })

export type NoteCommentsResponse = z.infer<typeof noteCommentsResponse>
