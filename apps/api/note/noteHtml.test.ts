// the note sanitizer keeps every tag the editor writes and drops everything else
import { expect, test } from "bun:test"
import { sanitizeNoteHtml } from "./noteHtml"

// the editor's own output, every construct the toolbar offers plus an empty line
const EDITOR_HTML =
	"<h1>Heading one</h1><h2>Heading two</h2><h3>Heading three</h3>" +
	'<p>Plain <b>bold</b> <i>italic</i> <u>underline</u> <s>strike</s> <code>inline code</code> <a href="https://carlnotes.com">a link</a>.</p>' +
	"<ul><li>bullet one</li><li>bullet two</li></ul><ol><li>first</li><li>second</li></ol>" +
	'<ul data-type="checkbox"><li checked>done</li><li>todo</li></ul>' +
	"<blockquote><p>a quote</p></blockquote><codeblock><p>const x = 1</p></codeblock><br><p>after an empty line</p>"

// every editor tag survives, the wrapper the editor adds is dropped, and a second pass changes nothing
test("every editor tag survives the sanitizer", () => {
	const sanitizedHtml = sanitizeNoteHtml(`<html>${EDITOR_HTML}</html>`)

	// each tag the toolbar offers
	for (const tag of ["h1", "h2", "h3", "b", "i", "u", "s", "code", "ul", "ol", "li", "blockquote", "codeblock"]) {
		expect(sanitizedHtml).toContain(`<${tag}>`)
	}

	// the link's href, the checkbox list's marker and its checked item, and the empty line
	expect(sanitizedHtml).toContain('<a href="https://carlnotes.com">a link</a>')
	expect(sanitizedHtml).toContain('<ul data-type="checkbox"><li checked>done</li><li>todo</li></ul>')
	expect(sanitizedHtml).toContain("<br />")

	// the wrapper goes, and the output is its own fixed point
	expect(sanitizedHtml).not.toContain("<html>")
	expect(sanitizeNoteHtml(sanitizedHtml)).toBe(sanitizedHtml)
})

// scripts, handlers, unsafe links, styles, mentions, and unknown tags go, with the readable text kept
test("hostile markup is stripped and its text kept", () => {
	const sanitizedHtml = sanitizeNoteHtml(
		'<p onclick="alert(1)">x<script>alert(2)</script><style>p{}</style></p>' +
			'<p><a href="javascript:alert(3)">j</a><a href="https://ok" target="_blank" rel="x">ok</a></p>' +
			'<p style="text-align:center">centered</p><mention text="a" indicator="@">m</mention><span>s</span><font>f</font>',
	)
	expect(sanitizedHtml).toBe('<p>x</p><p><a>j</a><a href="https://ok">ok</a></p><p>centered</p>msf')
})

// an image never stays, pasted or inserted
test("an image is dropped", () => {
	expect(sanitizeNoteHtml('<p>an image <img src="https://x.test/a.png" width="24" height="24"/> inline</p>')).toBe(
		"<p>an image  inline</p>",
	)
	expect(sanitizeNoteHtml('<p><img src="data:image/png;base64,AAA"/></p>')).toBe("<p></p>")
})

// a list's data-type is the checkbox marker or nothing
test("a list keeps data-type only as the checkbox marker", () => {
	expect(sanitizeNoteHtml('<ul data-type="other"><li>a</li></ul>')).toBe("<ul><li>a</li></ul>")
	expect(sanitizeNoteHtml('<ul data-type="checkbox"><li>a</li></ul>')).toBe('<ul data-type="checkbox"><li>a</li></ul>')
})

// the editor's empty document stores as an empty body
test("an empty document is an empty body", () => {
	expect(sanitizeNoteHtml("<html><br></html>")).toBe("")
	expect(sanitizeNoteHtml("")).toBe("")
})
