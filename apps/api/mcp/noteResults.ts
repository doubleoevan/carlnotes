// what read_notes returns: a page's tasting notes, or one note with its html and version, with what people wrote fenced
// as untrusted and a long html cut at a top-level block
import type { Note, NoteResponse, NotesResponse } from "@carlnotes/contracts/notes"
import { type NotePageLink, toNotePagePath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import { toUntrustedFence } from "@carlnotes/models/prompts/write"
import {
	MCP_PAGE_MAX_CHARS,
	type McpPage,
	packPage,
	toBudgetedTexts,
	toFencedUsername,
	UNTRUSTED_TEXT_NOTICE,
} from "./results"

// a tag's name and whether it closes, in the html the note editor saves
const HTML_TAG_PATTERN = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi

// the tags that never hold children, so they open no block
const VOID_TAGS = new Set(["br", "hr", "img"])

// a note as the model reads it, with its name and owner fenced
export type McpNote = Omit<Note, "owner"> & { ownerUsername: string | null }

// one opened note as the model reads it: its html, whether the html was cut, and the version a save names, null once
// the html was cut
type McpOpenedNote = McpNote & {
	notice: string
	html: string
	isHtmlCut: boolean
	version: number | null
	pageUrl: string
	cutNotice?: string
}

/**
 * Returns a page's url on the site.
 */
export function toNotePageUrl(notePageLink: NotePageLink): string {
	return `${SITE_URL}${toNotePagePath(notePageLink)}`
}

/**
 * Returns a page's notes as the model reads them, paged under the result limit, with their names fenced.
 */
export function toMcpNotesPage(
	notesResponse: NotesResponse,
	notePageLink: NotePageLink,
	offset: number,
): { notice: string; pageName: string; pageUrl: string; creatableVisibilities: string[] } & McpPage<McpNote> {
	// each note's name and owner are someone's words
	const toFencedText = toUntrustedFence()
	const mcpNotes = notesResponse.notes.map((note) => toMcpNote(note, toFencedText))

	// the page's name and link, the visibilities the caller may create, and a page of the notes
	return {
		notice: UNTRUSTED_TEXT_NOTICE,
		pageName: toFencedText(notesResponse.pageName),
		pageUrl: toNotePageUrl(notePageLink),
		creatableVisibilities: notesResponse.creatableVisibilities,
		...packPage(mcpNotes, offset, MCP_PAGE_MAX_CHARS),
	}
}

/**
 * Returns a note as the model reads it, its name and owner's username fenced.
 */
export function toMcpNote({ owner, ...note }: Note, toFencedText: (text: string) => string): McpNote {
	return { ...note, name: toFencedText(note.name), ownerUsername: toFencedUsername(toFencedText, owner) }
}

/**
 * Returns one opened note as the model reads it, its name and html fenced. A note past the result limit is cut at a
 * top-level block and has no version, so a body save never writes the cut copy over the whole note.
 */
export function toMcpOpenedNote(
	noteResponse: NoteResponse,
	pageUrl: string,
	maxChars = MCP_PAGE_MAX_CHARS,
): McpOpenedNote {
	// the html inside the budget, cut at a whole block
	const toFencedText = toUntrustedFence()
	const { html, version, ...note } = noteResponse
	const budgetedHtml = toBudgetedHtml(html, maxChars)

	// the note's fields, with what its owner and editors wrote fenced
	return {
		notice: UNTRUSTED_TEXT_NOTICE,
		...toMcpNote(note, toFencedText),
		html: toFencedText(budgetedHtml.html),
		// a cut note reads whole on its page, and only a whole read saves
		isHtmlCut: budgetedHtml.isCut,
		version: budgetedHtml.isCut ? null : version,
		pageUrl,
		...(budgetedHtml.isCut && {
			cutNotice: `This note is longer than one read. It reads whole on its page, ${pageUrl}, and saves there.`,
		}),
	}
}

// the html's top-level blocks inside the budget, and whether any were left out
function toBudgetedHtml(html: string, maxChars: number): { html: string; isCut: boolean } {
	const htmlBlocks = toHtmlBlocks(html)
	const keptBlocks = toBudgetedTexts(htmlBlocks, maxChars)
	const keptHtml = keptBlocks.join("")

	// the first block alone over the budget, cut inside itself
	if (keptHtml.length > maxChars) {
		return { html: keptHtml.slice(0, maxChars), isCut: true }
	}
	return { html: keptHtml, isCut: keptBlocks.length < htmlBlocks.length }
}

/**
 * Splits html into its top-level blocks: a paragraph, a heading, a whole list, a quote, or a code block each stays one
 * block with everything inside it.
 */
export function toHtmlBlocks(html: string): string[] {
	const htmlBlocks: string[] = []
	let blockStart = 0
	let depth = 0
	// a block ends where a closing tag brings the depth back to the top
	for (const tagMatch of html.matchAll(HTML_TAG_PATTERN)) {
		// a void or self-closing tag opens nothing
		const [tag, closingSlash, tagName = "", selfClosingSlash] = tagMatch
		if (VOID_TAGS.has(tagName.toLowerCase()) || selfClosingSlash) {
			continue
		}

		// an opening tag goes one level in, and a closing tag one level out
		depth += closingSlash ? -1 : 1
		if (closingSlash && depth === 0) {
			const blockEnd = (tagMatch.index ?? 0) + tag.length
			htmlBlocks.push(html.slice(blockStart, blockEnd))
			blockStart = blockEnd
		}
	}

	// what follows the last block, such as a bare empty line, is a block of its own
	const rest = html.slice(blockStart)
	return rest.trim() ? [...htmlBlocks, rest] : htmlBlocks
}
