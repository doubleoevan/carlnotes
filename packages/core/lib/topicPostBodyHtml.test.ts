// tests for a Topic Post's body html: each image on its own line and the title as an image's alt text for readers, body images at the api's origin and
// back, what the phone's editor drops, code block languages and image alt texts and alignments, and each image scaled to a
// view's width with its stored size put back for a save
import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import {
	toApiBodyImageHtml,
	toBlockImageHtml,
	toBodyImageSizes,
	toHtmlWithKeptAttributes,
	toSiteBodyImageHtml,
	toStoredSizeImageHtml,
	toTopicPostReaderHtml,
	toWidthLimitedImageHtml,
} from "./topicPostBodyHtml"

// each test that sets the api's origin puts the site's back
afterEach(() => configureApiClient({ apiBaseUrl: "", showError: () => {} }))

test("a code block takes the language of the previous block with the same text, wherever it moved", () => {
	// the typescript block moved below a new plain block
	const previousHtml = '<codeblock data-language="typescript"><p>const a = 1</p></codeblock>'
	const editedHtml = "<codeblock><p>echo hi</p></codeblock><codeblock><p>const a = 1</p></codeblock>"
	expect(toHtmlWithKeptAttributes(previousHtml, editedHtml)).toBe(
		'<codeblock><p>echo hi</p></codeblock><codeblock data-language="typescript"><p>const a = 1</p></codeblock>',
	)
})

test("an edited code block takes the language of the previous block at its alignment", () => {
	// the block's text changed, so only its alignment matches
	const previousHtml = '<p>a</p><codeblock data-language="python"><p>print(1)</p></codeblock>'
	const editedHtml = "<p>a</p><codeblock><p>print(2)</p></codeblock>"
	expect(toHtmlWithKeptAttributes(previousHtml, editedHtml)).toBe(
		'<p>a</p><codeblock data-language="python"><p>print(2)</p></codeblock>',
	)
})

test("an image takes the alt text and the alignment of the previous image at its path, signed or not", () => {
	// the previous body stored the path, and the editor shows a signed absolute url
	const path = "/api/topic-post-body-images/a/b/column.webp"
	const previousHtml = `<img src="${path}" alt="A latte" width="4" height="3" data-align="right" />`
	const editedHtml = `<p>x</p><img src="https://carlnotes.com${path}?expires=1&amp;signature=s" width="4" height="3" />`
	expect(toHtmlWithKeptAttributes(previousHtml, editedHtml)).toBe(
		`<p>x</p><img alt="A latte" data-align="right" src="https://carlnotes.com${path}?expires=1&amp;signature=s" width="4" height="3" />`,
	)
})

test("a body whose blocks and images keep their own attributes is unchanged", () => {
	// the edited body already names a language and an alt text
	const html = '<codeblock data-language="go"><p>x</p></codeblock><img src="/p.webp" alt="b" />'
	expect(toHtmlWithKeptAttributes('<codeblock data-language="rust"><p>x</p></codeblock>', html)).toBe(html)
})

test("a reader's image with no alt text takes the post's title, escaped, and one with alt text keeps it", () => {
	// one image with alt text and one without
	const html = '<img src="/a.webp" alt="A mug" /><img src="/b.webp" width="4" height="3" />'
	expect(toTopicPostReaderHtml({ html, title: 'Beans & "brews" <3' })).toBe(
		'<img src="/a.webp" alt="A mug" /><img alt="Beans &amp; &quot;brews&quot; &lt;3" src="/b.webp" width="4" height="3" />',
	)
})

test("a title or an alt text with a replacement pattern goes in as written", () => {
	// a reader's image takes the title, and an edited image takes the previous image's alt text
	const html = '<img src="/b.webp" />'
	expect(toTopicPostReaderHtml({ html, title: "$' and $&" })).toBe(`<img alt="$' and $&amp;" src="/b.webp" />`)
	expect(toHtmlWithKeptAttributes(`<img src="/b.webp" alt="$'" />`, html)).toBe(`<img alt="$'" src="/b.webp" />`)
})

test("a body image goes to the api's origin for an app and back to its site path for a save", () => {
	// the phone's api on another origin, and a body with a body image and an image from elsewhere
	configureApiClient({ apiBaseUrl: "http://192.168.1.2:3000", showError: () => {} })
	const path = "/api/topic-post-body-images/a/b/column.webp"
	const html = `<img src="${path}?expires=1&amp;signature=s" /><img src="https://example.com/x.png" />`

	// only the body image moves, and the round trip returns the stored body
	const apiHtml = toApiBodyImageHtml(html)
	expect(apiHtml).toBe(
		`<img src="http://192.168.1.2:3000${path}?expires=1&amp;signature=s" /><img src="https://example.com/x.png" />`,
	)
	expect(toSiteBodyImageHtml(apiHtml)).toBe(html)
})

test("the web's api on the site's origin leaves a body unchanged", () => {
	const html = '<img src="/api/topic-post-body-images/a/b/column.webp" />'
	expect(toApiBodyImageHtml(html)).toBe(html)
	expect(toSiteBodyImageHtml(html)).toBe(html)
})

test("each image in a paragraph moves to a paragraph of its own, between the text around it", () => {
	const [a, b] = ['<img src="/a.webp" width="4" height="3">', '<img src="/b.webp" width="4" height="3">']
	expect(toBlockImageHtml(`<p>Hello ${a} body</p>`)).toBe(`<p>Hello</p><p>${a}</p><p>body</p>`)
	expect(toBlockImageHtml(`<p>${a}${b}<br></p><p>Next</p>`)).toBe(`<p>${a}</p><p>${b}</p><p>Next</p>`)

	// a paragraph with no image, and an image inside bold, stay as they are
	expect(toBlockImageHtml("<p>Just <b>words</b></p>")).toBe("<p>Just <b>words</b></p>")
	expect(toBlockImageHtml(`<p><b>bold ${a} still</b></p>`)).toBe(`<p><b>bold ${a} still</b></p>`)
})

test("an image wider than the view scales down to it at its shape, and a narrower one stays as it is", () => {
	// a 1920 by 1280 photo and a 200 by 100 card in a 320 wide view
	const html = '<img src="/a.webp" width="1920" height="1280" /><img src="/b.webp" width="200" height="100" />'
	expect(toWidthLimitedImageHtml(html, 320)).toBe(
		'<img src="/a.webp" width="320" height="213" /><img src="/b.webp" width="200" height="100" />',
	)
})

test("a save puts back each image's stored size at its path, signed or not, and leaves an unknown image as it is", () => {
	// the stored body's size, and the editor's scaled, signed copy beside a new image
	const path = "/api/topic-post-body-images/a/b/column.webp"
	const sizes = toBodyImageSizes(`<img src="${path}" width="1920" height="1280" />`)
	const editedHtml = `<img src="https://carlnotes.com${path}?signature=s" width="320" height="213" /><img src="/c.webp" width="9" height="9" />`
	expect(toStoredSizeImageHtml(editedHtml, sizes)).toBe(
		`<img src="https://carlnotes.com${path}?signature=s" width="1920" height="1280" /><img src="/c.webp" width="9" height="9" />`,
	)
})
