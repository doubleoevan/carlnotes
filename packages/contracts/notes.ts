// the note contracts: a note, a page's notes, an opened note, its comment authors, and its badges
import type { noteVisibilities } from "./enums"

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
	// the comments written since then by somebody else, soft-deleted ones left out
	unreadComments: number
}

// one base64 yjs update posted from a note editor. a large paste arrives as one atomic update, so the limit is sized
// to hold one
export const NOTE_UPDATE_MAX_CHARS = 4 * 1024 * 1024

// the create body for a note on a page
export const NOTE_NAME_MAX_CHARS = 120

// one note as the notes table lists it
export type Note = {
	id: string
	name: string
	visibility: (typeof noteVisibilities)[number]
	createdAt: string
	updatedAt: string
	canEdit: boolean
	// whether the user created it, which alone allows changing its visibility
	isTopicOwner: boolean
	// whether the user may delete it: its owner, or an admin
	canDelete: boolean
}

// the notes payload for one page
export type NotesResponse = {
	// the page's display name, substituted into the empty state
	pageName: string
	// the visibilities the user may create a note in. empty for a visitor
	creatableVisibilities: (typeof noteVisibilities)[number][]
	// the usernames a comment's "@" menu offers: the holding team's members, empty without one
	mentionableUsernames: string[]
	notes: Note[]
}

// one note opened in its dialog. the stored HTML is what a read-only open renders
export type NoteResponse = Note & { html: string }

// a comment author as the note comment ui renders it
export type NoteCommentUser = {
	id: string
	username: string
	avatarUrl: string
}
