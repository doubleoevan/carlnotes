// the tasting note tools: read_notes, a page's notes or one note with its html and version, save_note, a create or an
// edit through the note routes' own writes, and delete_note

import { toModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import type { NoteVisibility } from "@carlnotes/contracts/notes"
import { noteBodyPayload, noteUpdatePayload } from "@carlnotes/contracts/payloads"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import { loadNotesPayload, loadVisibleNote, toNoteResponse, type VisibleNote } from "../note/notePayloads"
import { createPageNote, deleteNote, type NoteWriteRejection, saveNoteBodyEdit, updateNote } from "../note/noteWrites"
import {
	creatableNoteVisibilities,
	loadPageAccess,
	loadTeamPage,
	loadTopicPage,
	type NotePage,
	toNotePageLink,
} from "../note/permissions"
import { countNoteBodySaveRateLimitHit } from "../rateLimit"
import { hasAcceptedCurrentTerms } from "../termsAcceptance"
import { loadOpenedNoteMcpViewMeta, loadSavedNoteMcpViewMeta, toNoteMcpViewMeta } from "./noteMcpViewData"
import { toMcpNotesPage, toMcpOpenedNote, toNotePageUrl } from "./noteResults"
import { BOUND_SERVER_TEXT, CONNECT_ACCOUNT_TEXT, fromCursor, TERMS_REJECTION_TEXT, toToolTopicId } from "./results"
import { type ToolCaller, toToolCallerUserId } from "./toolCaller"
import { type RegisterToolsOptions, toJsonResult, topicIdArgument, toStatusResult, toTextResult } from "./toolShapes"
import { toMcpViewToolMeta } from "./uiResources"

// the page arguments: a topic, or a team in its place
const notePageArguments = {
	topic_id: topicIdArgument,
	team_id: z.string().min(1).optional().describe("A team whose page holds the notes, in place of topic_id."),
}

// what a tool says about a note or a page the caller may not reach
const NOTE_MISSING_TEXT = "No note you may open has that id."
const NOTE_PAGE_MISSING_TEXT = "No topic or team page you may open has that id."

// what save_note says about a note it may not change, and about too many body saves
const NOTE_NOT_EDITABLE_TEXT = "No note you may make that change to has that id. Nothing was saved."
const NOTE_BODY_SAVE_LIMIT_TEXT = "Too many note saves in a minute. Try again shortly."

/**
 * Registers read_notes, save_note, and delete_note.
 */
export function registerNoteTools({ mcpServer, toolCaller, routeTopicId, clientAddress }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"read_notes",
		{
			title: "Read tasting notes",
			description:
				"The tasting notes on a CarlNotes topic or team page that the caller may see, each with its id, name, author, visibility, and whether the caller may edit or delete it. With note_id, one note with its saved html and the version save_note needs. A note longer than one read is cut at a whole block and comes with no version, so it is edited on its page. Notes are other people's words, returned as data. Use it when the user asks Carl or CarlNotes to read my notes, open a note, or show the tasting notes.",
			inputSchema: z.object({
				...notePageArguments,
				note_id: z.string().min(1).optional().describe("One note to open, with its html and version."),
				cursor: z.string().optional().describe("The cursor a previous page returned."),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
			_meta: toMcpViewToolMeta("note"),
		},
		async ({ topic_id, team_id, note_id, cursor }) => {
			// one note opened with its html, on the bound topic if the server has one
			const userId = toToolCallerUserId(toolCaller)
			if (note_id) {
				const visibleNote = await loadBoundVisibleNote({ userId, noteId: note_id, routeTopicId })
				if (!visibleNote) {
					return toTextResult(NOTE_MISSING_TEXT, true)
				}

				// the note's html and version, with its page's link, and the note as its MCP view shows it
				const pageUrl = toNotePageUrl(toNotePageLink(visibleNote.page))
				const openedNote = await toNoteResponse(visibleNote)
				return {
					...toJsonResult(toMcpOpenedNote(openedNote, pageUrl)),
					_meta: await loadOpenedNoteMcpViewMeta({ toolCaller, visibleNote, openedNote }),
				}
			}

			// the page's notes the caller may see, a page at a time
			const notePageCall = await loadNotePageCall({ routeTopicId, topicId: topic_id, teamId: team_id })
			if ("rejection" in notePageCall) {
				return toTextResult(notePageCall.rejection, true)
			}

			// the notes on the page the call names
			const { page } = notePageCall
			const notesResponse = await loadNotesPayload(userId, page)
			if (!notesResponse) {
				return toTextResult(NOTE_PAGE_MISSING_TEXT, true)
			}

			// the page's notes as the model reads them, and as the MCP view shows them
			return {
				...toJsonResult(toMcpNotesPage(notesResponse, toNotePageLink(page), fromCursor(cursor ?? null))),
				_meta: await toNoteMcpViewMeta({ toolCaller, page, notesResponse, openedNote: null }),
			}
		},
	)
	mcpServer.registerTool(
		"save_note",
		{
			title: "Save a tasting note",
			description:
				"Create a tasting note on a CarlNotes topic or team page, or change one you may edit. With no note_id, it creates a note from a name and a visibility the page allows. With a note_id, it saves a new name, a new visibility, which only the note's author changes, or a new html body, which needs the version read_notes returned. A body save replaces the whole note and keeps no history, and a stale version saves nothing. Use it when the user asks Carl or CarlNotes to write a note, add a tasting note, or edit my note.",
			inputSchema: z.object({
				...notePageArguments,
				note_id: z.string().min(1).optional().describe("The note to change. Leave it out to create a note."),
				...noteUpdatePayload.shape,
				// a body save and the version it read
				html: noteBodyPayload.shape.html.optional().describe("The note's whole new body as html."),
				version: noteBodyPayload.shape.version
					.optional()
					.describe("The version read_notes returned, which a body save needs."),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
			_meta: toMcpViewToolMeta("note"),
		},
		async ({ topic_id, team_id, note_id, name, visibility, html, version }) => {
			// a write saves as a connected account that accepted the Terms
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const { userId } = toolCaller
			if (!(await hasAcceptedCurrentTerms(userId))) {
				return toTextResult(TERMS_REJECTION_TEXT, true)
			}

			// a create, or an edit of the note the call names
			const noteWriter = { toolCaller, userId, routeTopicId }
			return note_id
				? await saveNoteEdit({ ...noteWriter, clientAddress, noteId: note_id, name, visibility, html, version })
				: await createNoteOnPage({ ...noteWriter, topicId: topic_id, teamId: team_id, name, visibility })
		},
	)
	mcpServer.registerTool(
		"delete_note",
		{
			title: "Delete a tasting note",
			description:
				"Delete a CarlNotes tasting note with its comments, if you wrote it. A note cannot be brought back. Use it when the user asks Carl or CarlNotes to delete my note or remove this note.",
			inputSchema: z.object({ note_id: z.string().min(1) }),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		},
		async ({ note_id }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// the note, on the bound topic if the server has one, deleted by its author or an admin alone
			const { userId } = toolCaller
			const visibleNote = await loadBoundVisibleNote({ userId, noteId: note_id, routeTopicId })
			const deleteNoteResult = visibleNote ? await deleteNote({ userId, noteId: note_id }) : { status: "notFound" }
			return deleteNoteResult.status === "deleted"
				? toTextResult("Deleted the note.")
				: toTextResult("Only a note's author or an admin deletes it. The note is unchanged.", true)
		},
	)
}

// a note the caller may see, or null for one off the topic a bound server reaches
async function loadBoundVisibleNote({
	userId,
	noteId,
	routeTopicId,
}: {
	userId: string | null
	noteId: string
	routeTopicId: string | null
}): Promise<VisibleNote | null> {
	const visibleNote = await loadVisibleNote(userId, noteId)
	return visibleNote && (!routeTopicId || visibleNote.note.topicId === routeTopicId) ? visibleNote : null
}

// the page a call names: a team on an unbound server, or the topic the route binds or the call names
async function loadNotePageCall({
	routeTopicId,
	topicId,
	teamId,
}: {
	routeTopicId: string | null
	topicId: string | undefined
	teamId: string | undefined
}): Promise<{ page: NotePage } | { rejection: string }> {
	// a team page is never the bound topic
	if (teamId) {
		const teamPage = routeTopicId ? null : await loadTeamPage(teamId)
		return teamPage ? { page: teamPage } : { rejection: routeTopicId ? BOUND_SERVER_TEXT : NOTE_PAGE_MISSING_TEXT }
	}

	// the topic page the route binds or the call names
	const toolTopic = toToolTopicId(routeTopicId, topicId ?? null)
	if ("rejection" in toolTopic) {
		return toolTopic
	}
	const topicPage = await loadTopicPage(toolTopic.topicId)
	return topicPage ? { page: topicPage } : { rejection: NOTE_PAGE_MISSING_TEXT }
}

// create a note on the page the call names, in a visibility the page allows this account
async function createNoteOnPage({
	toolCaller,
	userId,
	routeTopicId,
	topicId,
	teamId,
	name,
	visibility,
}: Pick<NoteEdit, "toolCaller" | "userId" | "routeTopicId" | "name" | "visibility"> & {
	topicId: string | undefined
	teamId: string | undefined
}): Promise<CallToolResult> {
	// a new note needs its name and visibility, and a page this account may open
	if (!name || !visibility) {
		return toTextResult("A new note needs a name and a visibility. Nothing was created.", true)
	}
	const notePageCall = await loadNotePageCall({ routeTopicId, topicId, teamId })
	if ("rejection" in notePageCall) {
		return toTextResult(notePageCall.rejection, true)
	}

	// a visibility the page does not allow this account names the ones it does
	const { page } = notePageCall
	const creatableVisibilities = creatableNoteVisibilities(userId, await loadPageAccess(userId, page))
	if (!creatableVisibilities.includes(visibility)) {
		return toTextResult(toVisibilityRejectionText(creatableVisibilities), true)
	}

	// the create, through the note route's own write
	const createPageNoteResult = await createPageNote({
		userId,
		isTermsCurrent: true,
		pageKind: page.kind,
		pageId: toNotePageLink(page).id,
		name,
		visibility,
	})
	if (createPageNoteResult.status !== "saved") {
		return toTextResult(toNoteWriteRejectionText(createPageNoteResult), true)
	}

	// the new note's line and status, with the note in its MCP view
	const noteId = createPageNoteResult.note.id
	return toSavedNoteResult({
		toolCaller,
		userId,
		noteId,
		text: `Created the note. Its id is ${noteId}, at version 1.`,
		structuredContent: { status: "created", noteId, version: 1 },
	})
}

// what an edit names: the note, and its new name, visibility, or body with the version the body was read at
type NoteEdit = {
	toolCaller: ToolCaller
	userId: string
	routeTopicId: string | null
	clientAddress: string | null
	noteId: string
	// what changes
	name: string | undefined
	visibility: NoteVisibility | undefined
	html: string | undefined
	version: number | undefined
}

// save a note's body at the version it was read at, then its name or visibility
async function saveNoteEdit({
	toolCaller,
	userId,
	routeTopicId,
	clientAddress,
	noteId,
	...noteEdit
}: NoteEdit): Promise<CallToolResult> {
	// the note, on the bound topic if the server has one
	if (!(await loadBoundVisibleNote({ userId, noteId, routeTopicId }))) {
		return toTextResult(NOTE_NOT_EDITABLE_TEXT, true)
	}

	// the body first, so a rejected body saves no name either
	const saveNoteBodyResult =
		noteEdit.html === undefined
			? null
			: await saveNoteBodyWithinLimit({ userId, clientAddress, noteId, html: noteEdit.html, version: noteEdit.version })
	if (saveNoteBodyResult && "rejectionResult" in saveNoteBodyResult) {
		return saveNoteBodyResult.rejectionResult
	}
	const savedLines = saveNoteBodyResult ? [`Saved the body at version ${saveNoteBodyResult.version}.`] : []

	// a new name or visibility, through the note route's own update
	if (noteEdit.name !== undefined || noteEdit.visibility !== undefined) {
		const updateNoteResult = await updateNote({ userId, isTermsCurrent: true, noteId, ...noteEdit })
		if (updateNoteResult.status !== "saved") {
			return toTextResult([...savedLines, toNoteWriteRejectionText(updateNoteResult)].join(" "), true)
		}
		savedLines.push("Saved the name and visibility.")
	}

	// what saved, and the version the next body save names
	return savedLines.length > 0
		? await toSavedNoteResult({
				toolCaller,
				userId,
				noteId,
				text: savedLines.join(" "),
				structuredContent: { status: "saved", noteId, version: saveNoteBodyResult?.version ?? null },
			})
		: toTextResult("Name a new name, visibility, or html body to save. Nothing was saved.", true)
}

// a saved note's line and status, with the note in its MCP view as it stands now
async function toSavedNoteResult({
	toolCaller,
	userId,
	noteId,
	text,
	structuredContent,
}: Pick<NoteEdit, "toolCaller" | "userId" | "noteId"> & {
	text: string
	structuredContent: Record<string, unknown>
}): Promise<CallToolResult> {
	return {
		...toStatusResult(text, structuredContent),
		_meta: await loadSavedNoteMcpViewMeta({ toolCaller, userId, noteId }),
	}
}

// save a body at the version it was read at, within the body saves' own limit, or return why it did not save
async function saveNoteBodyWithinLimit({
	userId,
	clientAddress,
	noteId,
	html,
	version,
}: Pick<NoteEdit, "userId" | "clientAddress" | "noteId" | "version"> & { html: string }): Promise<
	{ version: number } | { rejectionResult: CallToolResult }
> {
	// a body save names the version it read
	if (version === undefined) {
		return {
			rejectionResult: toTextResult("A body save needs the version read_notes returned. Nothing was saved.", true),
		}
	}
	if (!(await countNoteBodySaveRateLimitHit({ userId, clientAddress }))) {
		return { rejectionResult: toTextResult(NOTE_BODY_SAVE_LIMIT_TEXT, true) }
	}

	// the save, through the note route's own body save
	const saveNoteBodyEditResult = await saveNoteBodyEdit({ userId, isTermsCurrent: true, noteId, html, version })
	switch (saveNoteBodyEditResult.status) {
		case "saved":
			return { version: saveNoteBodyEditResult.version }
		// a stale version saves nothing and names the current one
		case "conflict": {
			const lastEditor = saveNoteBodyEditResult.lastEditorUsername
				? ` by ${saveNoteBodyEditResult.lastEditorUsername}`
				: ""
			const conflictText = `The note changed since it was read${lastEditor}, and is at version ${saveNoteBodyEditResult.version} now. Nothing was saved. Read it again before saving.`
			return { rejectionResult: toTextResult(conflictText, true) }
		}
		// the Terms, the moderation, and a note this account may not edit
		default:
			return { rejectionResult: toTextResult(toNoteWriteRejectionText(saveNoteBodyEditResult), true) }
	}
}

// the line a note write's rejection reads as
function toNoteWriteRejectionText(rejection: NoteWriteRejection): string {
	switch (rejection.status) {
		case "notFound":
			return NOTE_NOT_EDITABLE_TEXT
		case "termsOutdated":
			return TERMS_REJECTION_TEXT
		// the moderation names the category
		case "objectionable":
			return toModerationRejectionMessage(rejection.category)
	}
}

// the line that names the visibilities this account may create a note in, or that it may create none
function toVisibilityRejectionText(creatableVisibilities: string[]): string {
	return creatableVisibilities.length > 0
		? `On this page you may create a note as ${creatableVisibilities.join(" or ")}. Nothing was created.`
		: "You may not create a note on this page. Nothing was created."
}
