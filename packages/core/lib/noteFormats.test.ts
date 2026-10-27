import { expect, mock, test } from "bun:test"
import { applyNoteLink, NOTE_FORMAT_GROUPS, type NoteEditorCommands, toNoteLinkUrl } from "./noteFormats"

test("the shared toolbar retains the web's supported formats and order", () => {
	expect(NOTE_FORMAT_GROUPS.map((group) => group.map((format) => format.label))).toEqual([
		["Bold", "Italic", "Underline", "Strikethrough", "Inline code"],
		["Heading 1", "Heading 2", "Heading 3"],
		["Bulleted list", "Numbered list", "Checklist"],
		["Quote", "Code block"],
	])
})

test("format commands target the editor and checklists start unchecked", () => {
	// exercise the commands shared by the web and native buttons
	const commands: [string, unknown[]][] = []
	const editor = new Proxy({} as NoteEditorCommands, {
		get:
			(_target, name) =>
			(...args: unknown[]) =>
				commands.push([String(name), args]),
	})
	for (const group of NOTE_FORMAT_GROUPS) {
		for (const format of group) {
			format.toggle(editor)
		}
	}
	expect(commands).toEqual([
		["toggleBold", []],
		["toggleItalic", []],
		["toggleUnderline", []],
		["toggleStrikeThrough", []],
		["toggleInlineCode", []],
		["toggleH1", []],
		["toggleH2", []],
		["toggleH3", []],
		["toggleUnorderedList", []],
		["toggleOrderedList", []],
		["toggleCheckboxList", [false]],
		["toggleBlockQuote", []],
		["toggleCodeBlock", []],
	])
})

test.each([
	["example.com/notes", "https://example.com/notes"],
	[" https://example.com ", "https://example.com/"],
	["http://example.com/note", "http://example.com/note"],
	["mailto:reader@example.com", "mailto:reader@example.com"],
])("safe link input %s normalizes once", (input, expected) => {
	expect(toNoteLinkUrl(input)).toBe(expected)
})

test.each([
	"",
	"javascript:alert(1)",
	"data:text/html,test",
	"file:///note",
	"ftp://example.com",
	"https://a b",
	"java\tscript:alert(1)",
])("unsupported link %s is rejected", (input) => {
	expect(toNoteLinkUrl(input)).toBeNull()
})

test("link actions keep the captured range and reject multi-paragraph selections", () => {
	// new links use selected text and edits preserve the existing link range
	const setLink = mock(() => {})
	const editor = { setLink } as unknown as NoteEditorCommands
	const selection = { start: 3, end: 7, text: "note" }
	expect(applyNoteLink({ editor, selection, activeLink: null, url: "example.com" })).toBe(true)
	expect(setLink).toHaveBeenLastCalledWith(3, 7, "note", "https://example.com/")
	const activeLink = { start: 1, end: 5, text: "link", url: "https://old.example" }
	expect(applyNoteLink({ editor, selection, activeLink, url: "https://new.example" })).toBe(true)
	expect(setLink).toHaveBeenLastCalledWith(1, 5, "link", "https://new.example/")

	// a blocked or unsafe link sends no editor command
	expect(
		applyNoteLink({
			editor,
			selection: { ...selection, text: "two\nparagraphs" },
			activeLink: null,
			url: "example.com",
		}),
	).toBe(false)
	expect(applyNoteLink({ editor, selection, activeLink: null, url: "javascript:bad" })).toBe(false)
	expect(setLink).toHaveBeenCalledTimes(2)
})
