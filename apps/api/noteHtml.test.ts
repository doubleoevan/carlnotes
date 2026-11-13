// the note sanitizer keeps every tag the editor writes and drops everything else
import { expect, test } from "bun:test"
import { sanitizeNoteHtml, sanitizeTopicPostHtml } from "./noteHtml"

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

test("a NUL is dropped and the text around it kept", () => {
	expect(sanitizeNoteHtml("<p>one\u0000 two</p>")).toBe("<p>one two</p>")
})

// a post, another post, and an image of the post, each a uuid
const TOPIC_POST_ID = "0b6b9a52-6a0c-4d8e-9b1a-2f4a1c3d5e6f"
const OTHER_TOPIC_POST_ID = "1c7c0b63-7b1d-4e9f-8c2b-3a5b2d4e6f70"
const IMAGE_ID = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"
const IMAGE_PATH = `/api/topic-post-body-images/${TOPIC_POST_ID}/${IMAGE_ID}/column.webp`

// the img a save keeps: the post's own column copy at a size
const KEPT_IMAGE_HTML = `<img src="${IMAGE_PATH}" width="800" height="600" />`

// a body holding one img, sanitized for the post
function toSanitizedImage(imageHtml: string): string {
	return sanitizeTopicPostHtml(`<p>before ${imageHtml} after</p>`, TOPIC_POST_ID)
}

test("a Topic Post keeps its own body image with its size and alt text", () => {
	expect(toSanitizedImage(`<img src="${IMAGE_PATH}" width="800" height="600" alt=" A  chart ">`)).toBe(
		`<p>before <img src="${IMAGE_PATH}" width="800" height="600" alt="A chart" /> after</p>`,
	)
	expect(toSanitizedImage(KEPT_IMAGE_HTML)).toBe(`<p>before ${KEPT_IMAGE_HTML} after</p>`)
})

test("a Topic Post's block keeps a left, center, or right text-align and nothing else in its style", () => {
	const html = '<p style="text-align: center; color: red">a</p><h2 style="text-align: justify">b</h2>'
	expect(sanitizeTopicPostHtml(html, TOPIC_POST_ID)).toBe('<p style="text-align:center">a</p><h2>b</h2>')
	expect(
		sanitizeTopicPostHtml('<ul data-type="checkbox" style="text-align: right"><li>c</li></ul>', TOPIC_POST_ID),
	).toBe('<ul data-type="checkbox" style="text-align:right"><li>c</li></ul>')

	// a Tasting Note keeps no style
	expect(sanitizeNoteHtml('<p style="text-align: center">a</p>')).toBe("<p>a</p>")
})

test("a body image keeps its place on the list, and a place off it is dropped", () => {
	expect(toSanitizedImage(`<img src="${IMAGE_PATH}" width="800" height="600" data-align="right">`)).toBe(
		`<p>before <img src="${IMAGE_PATH}" width="800" height="600" data-align="right" /> after</p>`,
	)
	expect(toSanitizedImage(`<img src="${IMAGE_PATH}" width="800" height="600" data-align="top">`)).toBe(
		`<p>before ${KEPT_IMAGE_HTML} after</p>`,
	)
})

test("an img on another origin or another post's path is dropped", () => {
	const droppedSrcs = [
		`https://evil.example${IMAGE_PATH}`,
		`//evil.example${IMAGE_PATH}`,
		`/api/topic-post-body-images/${OTHER_TOPIC_POST_ID}/${IMAGE_ID}/column.webp`,
		`/api/topic-post-body-images/${TOPIC_POST_ID}/${IMAGE_ID}/original.webp`,
		"data:image/png;base64,AAAA",
		"blob:http://localhost:5173/1234",
	]
	for (const droppedSrc of droppedSrcs) {
		expect(toSanitizedImage(`<img src="${droppedSrc}" width="800" height="600">`)).toBe("<p>before  after</p>")
	}
})

test("a url that only starts with the post's path is dropped", () => {
	// dot segments that leave the post, an encoded slash, a longer path, and a host after the prefix
	const droppedSrcs = [
		`/api/topic-post-body-images/${TOPIC_POST_ID}/../${OTHER_TOPIC_POST_ID}/${IMAGE_ID}/column.webp`,
		`/api/topic-post-body-images/${TOPIC_POST_ID}%2F${IMAGE_ID}/column.webp`,
		`${IMAGE_PATH}/extra`,
		`${IMAGE_PATH}@evil.example/x`,
		`https://user@evil.example${IMAGE_PATH}`,
	]
	for (const droppedSrc of droppedSrcs) {
		expect(toSanitizedImage(`<img src="${droppedSrc}" width="800" height="600">`)).toBe("<p>before  after</p>")
	}
})

test("srcset, style, and an event handler are dropped from a kept img", () => {
	expect(
		toSanitizedImage(
			`<img src="${IMAGE_PATH}" width="800" height="600" srcset="https://evil.example/a.png 2x" style="width:1px" onerror="alert(1)">`,
		),
	).toBe(`<p>before ${KEPT_IMAGE_HTML} after</p>`)
})

test("an img with a missing or out-of-range size is dropped", () => {
	const droppedSizes = ['height="600"', 'width="800" height="0"', 'width="4097" height="600"', 'width="1.5" height="2"']
	for (const droppedSize of droppedSizes) {
		expect(toSanitizedImage(`<img src="${IMAGE_PATH}" ${droppedSize}>`)).toBe("<p>before  after</p>")
	}
})

test("a signed or absolute src on our own site is stored as its path", () => {
	expect(toSanitizedImage(`<img src="${IMAGE_PATH}?expires=1&amp;signature=abc" width="800" height="600">`)).toBe(
		`<p>before ${KEPT_IMAGE_HTML} after</p>`,
	)
	expect(toSanitizedImage(`<img src="http://localhost:5173${IMAGE_PATH}" width="800" height="600">`)).toBe(
		`<p>before ${KEPT_IMAGE_HTML} after</p>`,
	)
})

test("the removed image is dropped and the post's others stay", () => {
	const html = `<p>${KEPT_IMAGE_HTML}</p>`
	expect(sanitizeTopicPostHtml(html, TOPIC_POST_ID, { removedImageId: IMAGE_ID })).toBe("<p></p>")
	expect(sanitizeTopicPostHtml(html, TOPIC_POST_ID)).toBe(html)
})

test("a code block keeps a language on the list or Plain text alone", () => {
	expect(sanitizeTopicPostHtml('<codeblock data-language="typescript"><p>x</p></codeblock>', TOPIC_POST_ID)).toBe(
		'<codeblock data-language="typescript"><p>x</p></codeblock>',
	)
	expect(sanitizeTopicPostHtml('<codeblock data-language="plaintext"><p>x</p></codeblock>', TOPIC_POST_ID)).toBe(
		'<codeblock data-language="plaintext"><p>x</p></codeblock>',
	)
	expect(sanitizeTopicPostHtml('<codeblock data-language="cobol"><p>x</p></codeblock>', TOPIC_POST_ID)).toBe(
		"<codeblock><p>x</p></codeblock>",
	)
})

test("a Tasting Note keeps no img and no code block language", () => {
	expect(sanitizeNoteHtml(`<p>${KEPT_IMAGE_HTML}</p><codeblock data-language="typescript"><p>x</p></codeblock>`)).toBe(
		"<p></p><codeblock><p>x</p></codeblock>",
	)
})
