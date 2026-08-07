// render tests for allowed urls: formatting survives, untrusted links do not
// renderToStaticMarkup gives the exact HTML the browser would build, so anchors and images are asserted, not assumed
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ScrollNote } from "./TopicScanRecap"

// one note trying every escape hatch at once: a written link, raw HTML, an image, and a bare url to convert to plain text
const HOSTILE_NOTE = [
	"**The numbers:** 3 kept.",
	"- [click me](https://evil.test)",
	'<a href="https://evil.test">or here</a>',
	"![carl](https://evil.test/x.png)",
	"Findings: https://real.example/post",
].join("\n\n")

// the allowed structure renders as markup while unauthorized links render as plain text
test("a note renders formatting but nothing clickable or embedded", () => {
	const html = renderToStaticMarkup(<ScrollNote note={HOSTILE_NOTE} />)

	// bold and the list render as real elements
	expect(html).toContain("<strong")
	expect(html).toContain("<li")

	// no anchor and no image anywhere in the output
	expect(html).not.toContain("<a ")
	expect(html).not.toContain("<img")

	// the written link keeps its label and shows its destination as plain text
	expect(html).toContain("click me")
	expect(html).toContain("(https://evil.test)")

	// raw HTML reads as the characters the model typed
	expect(html).toContain("&lt;a href=")

	// the bare url renders only once as text, not as a label and again as a destination
	expect(html.split("https://real.example/post")).toHaveLength(2)
})

// a kept Finding's own url is allowed
test("a link to a kept finding's url renders as an anchor while others stay inert", () => {
	// one citation of a kept finding and one of an attacker's choosing, in the same note
	const note = "Findings:\n\n- [the agent piece](https://kept.example/post)\n- [click me](https://evil.test)"
	const html = renderToStaticMarkup(<ScrollNote note={note} allowedUrls={new Set(["https://kept.example/post"])} />)

	// the kept citation is a real anchor to its stored url
	expect(html).toContain('href="https://kept.example/post"')
	expect(html).toContain("the agent piece")

	// the other link is plain text showing its destination without an anchor
	expect(html).not.toContain('href="https://evil.test"')
	expect(html).toContain("(https://evil.test)")
})
