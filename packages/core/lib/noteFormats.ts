// the editor commands both platform adapters implement
export type NoteEditorCommands = {
	blur?: () => void
	toggleBold: () => void
	toggleItalic: () => void
	toggleUnderline: () => void
	toggleStrikeThrough: () => void
	toggleInlineCode: () => void
	toggleH1: () => void
	toggleH2: () => void
	toggleH3: () => void
	toggleUnorderedList: () => void
	toggleOrderedList: () => void
	toggleCheckboxList: (isChecked: boolean) => void
	toggleBlockQuote: () => void
	toggleCodeBlock: () => void
	setLink: (start: number, end: number, text: string, url: string) => void
	removeLink: (start: number, end: number) => void
}

// the format state, selection, and detected link contain no platform types
export type NoteFormatKey =
	| "bold"
	| "italic"
	| "underline"
	| "strikeThrough"
	| "inlineCode"
	| "h1"
	| "h2"
	| "h3"
	| "unorderedList"
	| "orderedList"
	| "checkboxList"
	| "blockQuote"
	| "codeBlock"
export type NoteFormatState = Partial<Record<NoteFormatKey | "link", { isActive: boolean; isBlocking: boolean }>>
export type NoteSelection = { start: number; end: number; text: string }
export type NoteLink = NoteSelection & { url: string }
export type NoteFormat = {
	label: string
	stateKey: NoteFormatKey
	toggle: (editor: NoteEditorCommands) => void
}

// the controls in the web's order, grouped by inline marks, headings, lists, and blocks
export const NOTE_FORMAT_GROUPS: readonly (readonly NoteFormat[])[] = [
	[
		{ label: "Bold", stateKey: "bold", toggle: (editor) => editor.toggleBold() },
		{ label: "Italic", stateKey: "italic", toggle: (editor) => editor.toggleItalic() },
		{ label: "Underline", stateKey: "underline", toggle: (editor) => editor.toggleUnderline() },
		{ label: "Strikethrough", stateKey: "strikeThrough", toggle: (editor) => editor.toggleStrikeThrough() },
		{ label: "Inline code", stateKey: "inlineCode", toggle: (editor) => editor.toggleInlineCode() },
	],
	[
		{ label: "Heading 1", stateKey: "h1", toggle: (editor) => editor.toggleH1() },
		{ label: "Heading 2", stateKey: "h2", toggle: (editor) => editor.toggleH2() },
		{ label: "Heading 3", stateKey: "h3", toggle: (editor) => editor.toggleH3() },
	],
	[
		{ label: "Bulleted list", stateKey: "unorderedList", toggle: (editor) => editor.toggleUnorderedList() },
		{ label: "Numbered list", stateKey: "orderedList", toggle: (editor) => editor.toggleOrderedList() },
		{ label: "Checklist", stateKey: "checkboxList", toggle: (editor) => editor.toggleCheckboxList(false) },
	],
	[
		{ label: "Quote", stateKey: "blockQuote", toggle: (editor) => editor.toggleBlockQuote() },
		{ label: "Code block", stateKey: "codeBlock", toggle: (editor) => editor.toggleCodeBlock() },
	],
]

/**
 * Returns a safe note URL, adding HTTPS to a bare host.
 */
export function toNoteLinkUrl(typedUrl: string): string | null {
	// reject unsupported schemes before normalizing a host
	const trimmedUrl = typedUrl.trim()
	// biome-ignore lint/suspicious/noControlCharactersInRegex: reject hidden characters in link destinations
	if (!trimmedUrl || /[\u0000-\u0020\u007f]/.test(trimmedUrl)) {
		return null
	}
	const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmedUrl)
	if (hasScheme && !/^(https?:\/\/|mailto:)/i.test(trimmedUrl)) {
		return null
	}

	// normalize the destination once for applying and opening links
	try {
		return new URL(hasScheme ? trimmedUrl : `https://${trimmedUrl}`).href
	} catch {
		return null
	}
}

/**
 * Applies a safe link to the captured selection or existing link.
 */
export function applyNoteLink({
	editor,
	selection,
	activeLink,
	url,
}: {
	editor: NoteEditorCommands | null
	selection: NoteSelection
	activeLink: NoteLink | null
	url: string
}): boolean {
	// retain the intended range while the URL field owns focus
	const linkUrl = toNoteLinkUrl(url)
	if (!editor || !linkUrl || selection.text.includes("\n")) {
		return false
	}
	const linkRange = activeLink ?? selection
	editor.setLink(linkRange.start, linkRange.end, linkRange.text || linkUrl, linkUrl)
	return true
}
