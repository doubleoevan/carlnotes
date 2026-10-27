import type { NoteVisibility } from "@carlnotes/contracts/notes"
import type { NoteSaveErrorReason, NoteSaveStatus } from "../hooks/useNoteBodySave"

// keep the wording of a note's permissions and save state identical across clients
export const NOTE_VISIBILITY_DESCRIPTIONS: Record<NoteVisibility, string> = {
	private: "Only you can see this note.",
	team: "Only your team can see this note.",
	public: "Everyone can see this note.",
}
export const NOTE_SAVE_STATUS_LABELS: Record<NoteSaveStatus, string> = {
	saving: "Saving…",
	saved: "Saved",
	unsaved: "Not saved",
}
export const NOTE_SAVE_ERRORS: Record<NoteSaveErrorReason, string> = {
	tooLarge: "That note is too long to save. Copy your latest changes, then shorten it.",
	failed: "That note didn't save. Carl kept your words — try again in a moment.",
	unavailable: "This note is no longer available to edit.",
}

// confirm irreversible comment deletion with the same wording on web and mobile
export const NOTE_COMMENT_DELETE = {
	title: "Delete this comment?",
	description: "This permanently deletes your comment. This cannot be undone.",
	confirmLabel: "Delete comment",
	cancelLabel: "Keep it",
}

// keep creation and recovery messages alongside the shared components that use them
export const NOTE_LABELS = {
	renameError: "That name didn't stick. Carl suggests trying again.",
	visibilityError: "That visibility didn't take. Carl suggests trying again.",
	deleteError: "Carl couldn't toss that note. Try again in a moment.",
	loading: "Unfolding the note…",
	createError: "Carl couldn't start that note. Try again in a moment.",
	reloadError: "Carl couldn't reload that note. Try again in a moment.",
	openError: "Carl couldn't open that note. Try again in a moment.",
	storageError: "Your latest changes couldn't be kept on this device. Keep this note open and copy your words.",
}

// both platforms confirm deletion of the note and its comments
export const NOTE_DELETE = {
	title: "Delete this note?",
	confirmLabel: "Delete note",
	cancelLabel: "Keep it",
}

/**
 * Names the note and comments that deletion permanently removes.
 */
export function toNoteDeleteDescription(name: string): string {
	return `"${name}" and its comments go in the bin. Carl can't fish them back out.`
}
