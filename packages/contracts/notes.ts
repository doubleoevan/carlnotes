// the note contracts: a note, a page's notes, an opened note with its body and version, a save's results, a comment,
// and the badges
import type { noteVisibilities } from "./enums"
import type { ProfileIdentity } from "./profiles"

// one note's unread counts for the signed-in user
export type NoteBadge = {
	noteId: string
	// the page the note sits on, exactly one of the two
	topicId: string | null
	teamId: string | null
	// every team the page belongs to, so a team badge counts its topics' notes as well as its own
	teamIds: string[]
	// the note's own name, and the topic or team holding it, both named in the badge's tooltip
	noteName: string
	pageName: string
	// 1 when somebody else changed the body since the user last opened it, however many edits it took
	unreadEdits: number
	// the comments written since then by somebody else
	unreadComments: number
}

// the longest HTML body a note keeps. the save route's own body limit admits any UTF-8 encoding of a string this long
export const NOTE_HTML_MAX_CHARS = 512 * 1024

// the longest comment a note takes
export const NOTE_COMMENT_MAX_CHARS = 2000

// the longest name a note takes
export const NOTE_NAME_MAX_CHARS = 120

// the visibility values a note can use
export type NoteVisibility = (typeof noteVisibilities)[number]

// the table's note summary with the server's current permissions
export type Note = {
	id: string
	name: string
	visibility: NoteVisibility
	createdAt: string
	updatedAt: string
	canEdit: boolean
	// whether the user created it, which alone allows changing its visibility
	isNoteOwner: boolean
	// whether the user may delete it: its owner, or an admin
	canDelete: boolean
}

// the notes payload for one page
export type NotesResponse = {
	// the page's display name, substituted into the empty state
	pageName: string
	// the visibilities the user may create a note in. empty for a visitor
	creatableVisibilities: (typeof noteVisibilities)[number][]
	notes: Note[]
}

// one note opened in its dialog: the stored HTML body, which the editor and the reader both render, and the version
// the next save names
export type NoteResponse = Note & { html: string; version: number }

// a save the api kept: the version the body is stored at now
export type NoteBodyResponse = { version: number }

// a save that lost to a newer version: the version stored now and who saved it, null for a closed account
export type NoteConflict = { version: number; lastEditorUsername: string | null }
export type NoteBodyConflictResponse = { error: "conflict" } & NoteConflict

// how a body save ended: kept at a version or lost to a newer one, which the api decides, or too large for the api
// to keep or never arrived, which the api client reports
export type NoteBodySaveResult =
	| { status: "saved"; version: number }
	| ({ status: "conflict" } & NoteConflict)
	| { status: "tooLarge" }
	| { status: "unavailable" }
	| { status: "failed" }

// one comment on a note's thread. a closed account leaves no author
export type NoteComment = {
	id: string
	body: string
	createdAt: string
	author: ProfileIdentity | null
	// whether the user may delete it: its author
	canDelete: boolean
}
