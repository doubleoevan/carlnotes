// the Topic Post page's body in the server render: plain paragraphs at the rich text's line spacing
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TOPIC_POST_PAGE_ELEMENTS } from "./TopicPostPage"

test("the server renders a post's body as plain paragraphs at the rich text's line spacing", () => {
	// render a body with a heading and a paragraph, as the server does
	const { Body } = TOPIC_POST_PAGE_ELEMENTS
	const html = renderToStaticMarkup(<Body html="<h1>Start</h1><p>First <b>bold</b> line.</p>" />)

	// each block is a plain paragraph, in a box with the note's line spacing
	expect(html).toContain('style="line-height:1.625"')
	expect(html).toContain("<p>Start</p><p>First bold line.</p>")
})
