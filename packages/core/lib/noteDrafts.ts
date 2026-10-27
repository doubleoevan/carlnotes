import type { Note, NoteBodySaveResult, NoteConflict, NoteResponse, NoteVisibility } from "@carlnotes/contracts/notes"
// the portable working copy and its transport state never own timers or storage
export type NoteSaveErrorReason = "tooLarge" | "failed" | "unavailable"
export type NoteBodyDraft = {
	html: string
	version: number
	revision: number
	hasPendingChanges: boolean
	conflict: NoteConflict | null
	errorReason: NoteSaveErrorReason | null
}
export type NoteDraftState = {
	latestHtml: string
	lastSavedHtml: string
	savedVersion: number
	revision: number
	pendingHtml: string | null
	sendingHtml: string | null
	conflict: NoteConflict | null
	errorReason: NoteSaveErrorReason | null
	isRetired: boolean
}
export type NoteDraftAction =
	| { type: "edit"; html: string }
	| { type: "start" }
	| { type: "result"; html: string; result: NoteBodySaveResult }
	| { type: "reload"; html: string; version: number }
	| { type: "baseline"; html: string }
	| { type: "retire" }

/**
 * Restores the original version and local revision without silently rebasing pending text.
 */
export function toNoteDraftState(html: string, version: number, pending?: NoteBodyDraft): NoteDraftState {
	return {
		latestHtml: pending?.html ?? html,
		lastSavedHtml: html,
		savedVersion: pending?.version ?? version,
		revision: pending?.revision ?? 0,
		pendingHtml: pending?.hasPendingChanges ? pending.html : null,
		sendingHtml: null,
		conflict: pending?.conflict ?? null,
		errorReason: pending?.errorReason ?? null,
		isRetired: false,
	}
}

/**
 * Applies one edit, acknowledgement, conflict or retirement without performing side effects.
 */
export function transitionNoteDraft(state: NoteDraftState, action: NoteDraftAction): NoteDraftState {
	if (state.isRetired) {
		return state
	}
	switch (action.type) {
		case "retire":
			return { ...state, isRetired: true }
		case "start":
			return canSaveNoteDraft(state) ? { ...state, sendingHtml: state.pendingHtml, pendingHtml: null } : state
		case "edit":
			return editDraft(state, action.html)
		case "baseline": {
			if (state.pendingHtml !== null || state.sendingHtml !== null) {
				return state
			}
			const html = action.html.replace(/<img\b[^>]*\/?>/gi, "")
			return { ...state, latestHtml: html, lastSavedHtml: html }
		}
		case "reload":
			return { ...toNoteDraftState(action.html, action.version), revision: state.revision + 1 }
		case "result":
			return acceptDraftResult(state, action.html, action.result)
	}
}

/**
 * Allows one request only while editable pending text has no unresolved conflict or validation failure.
 */
export function canSaveNoteDraft(state: NoteDraftState): boolean {
	return (
		!state.isRetired &&
		state.sendingHtml === null &&
		state.pendingHtml !== null &&
		state.conflict === null &&
		state.errorReason !== "tooLarge" &&
		state.errorReason !== "unavailable"
	)
}

/**
 * Publishes a storage-safe revision without transient request state.
 */
export function toNoteBodyDraft(state: NoteDraftState): NoteBodyDraft {
	return {
		html: state.latestHtml,
		version: state.savedVersion,
		revision: state.revision,
		hasPendingChanges: state.pendingHtml !== null || state.sendingHtml !== null,
		conflict: state.conflict,
		errorReason: state.errorReason,
	}
}

// keep device drafts independent of feed-cache versions and deployment identities
export const NOTE_DRAFT_SCHEMA = 1
export const NOTE_DRAFT_PREFIX = "carlnotes.note-drafts.v1:"
export type NoteDraftContext = {
	pageType: "topic" | "team"
	pageId: string
	pageName: string
	creatableVisibilities: NoteVisibility[]
}
export type NoteDraftRecord = NoteDraftContext & {
	accountId: string
	note: Note
	draft: NoteBodyDraft
}

/**
 * Names an account's durable drafts without sharing a storage key with another account.
 */
export function toNoteDraftKey(accountId: string): string {
	return `${NOTE_DRAFT_PREFIX}${encodeURIComponent(accountId)}`
}

/**
 * Restores only this account's supported, editable draft records.
 */
export function parseNoteDrafts(serialized: string | null, accountId: string): NoteDraftRecord[] {
	if (!serialized) {
		return []
	}
	const envelope: unknown = JSON.parse(serialized)
	if (!isRecord(envelope) || envelope.schema !== NOTE_DRAFT_SCHEMA || !Array.isArray(envelope.notes)) {
		throw new Error("unsupported note draft storage")
	}
	// retain drafts written before Team notes gained native routes
	const notes = envelope.notes.map((entry: unknown) => {
		if (isRecord(entry) && typeof entry.topicId === "string" && entry.pageType === undefined) {
			const { topicId, ...draft } = entry
			return { ...draft, pageType: "topic", pageId: topicId }
		}
		return entry
	})
	if (!notes.every((entry) => isNoteDraftRecord(entry, accountId))) {
		throw new Error("invalid note draft storage")
	}
	return notes
}

/**
 * Reconstitutes a recoverable note without changing the version its draft originally edited.
 */
export function toDraftNote(record: NoteDraftRecord): NoteResponse {
	return { ...record.note, html: record.draft.html, version: record.draft.version }
}

/**
 * Encodes the latest account-owned revisions, including their unresolved conflicts and validation errors.
 */
export function serializeNoteDrafts(notes: NoteDraftRecord[]): string {
	return JSON.stringify({ schema: NOTE_DRAFT_SCHEMA, notes })
}

// validate untrusted persisted values before allowing them to reach an editor or a request
function isNoteDraftRecord(value: unknown, accountId: string): value is NoteDraftRecord {
	if (
		!isRecord(value) ||
		value.accountId !== accountId ||
		(value.pageType !== "topic" && value.pageType !== "team") ||
		typeof value.pageId !== "string" ||
		typeof value.pageName !== "string"
	) {
		return false
	}
	return (
		Array.isArray(value.creatableVisibilities) &&
		value.creatableVisibilities.every(isVisibility) &&
		isNote(value.note) &&
		isDraft(value.draft)
	)
}
function isNote(value: unknown): value is Note {
	if (!isRecord(value)) {
		return false
	}
	return (
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		isVisibility(value.visibility) &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string" &&
		value.canEdit === true &&
		typeof value.isNoteOwner === "boolean" &&
		typeof value.canDelete === "boolean"
	)
}
function isDraft(value: unknown): value is NoteBodyDraft {
	if (!isRecord(value)) {
		return false
	}
	return (
		typeof value.html === "string" &&
		Number.isSafeInteger(value.version) &&
		Number(value.version) >= 0 &&
		Number.isSafeInteger(value.revision) &&
		Number(value.revision) >= 0 &&
		value.hasPendingChanges === true &&
		isConflict(value.conflict) &&
		[null, "failed", "tooLarge", "unavailable"].includes(value.errorReason as string | null)
	)
}
function isConflict(value: unknown): boolean {
	return (
		value === null ||
		(isRecord(value) &&
			Number.isSafeInteger(value.version) &&
			(value.lastEditorUsername === null || typeof value.lastEditorUsername === "string"))
	)
}
function isVisibility(value: unknown): value is NoteVisibility {
	return value === "private" || value === "team" || value === "public"
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

// retain the newest local revision independently of the request it may be waiting behind
function editDraft(state: NoteDraftState, nextHtml: string): NoteDraftState {
	// preserve a conflict while retaining every subsequent keystroke
	const html = nextHtml.replace(/<img\b[^>]*\/?>/gi, "")
	const didChange = html !== state.latestHtml
	return {
		...state,
		latestHtml: html,
		revision: state.revision + Number(didChange),
		errorReason: didChange && state.errorReason !== "unavailable" ? null : state.errorReason,
		pendingHtml: state.conflict || html !== (state.sendingHtml ?? state.lastSavedHtml) ? html : null,
	}
}

// preserve unsent text when a response arrives for an earlier revision
function acceptDraftResult(state: NoteDraftState, html: string, result: NoteBodySaveResult): NoteDraftState {
	// only accepted acknowledgements advance the base; a newer pending body remains queued
	if (result.status === "saved") {
		return {
			...state,
			sendingHtml: null,
			lastSavedHtml: html,
			savedVersion: result.version,
			conflict: null,
			errorReason: null,
		}
	}
	const pendingHtml = state.pendingHtml ?? html
	if (result.status === "conflict") {
		return {
			...state,
			sendingHtml: null,
			pendingHtml,
			conflict: { version: result.version, lastEditorUsername: result.lastEditorUsername },
		}
	}
	return {
		...state,
		sendingHtml: null,
		pendingHtml,
		errorReason: result.status === "tooLarge" && state.latestHtml !== html ? null : result.status,
	}
}
