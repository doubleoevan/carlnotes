// the topic prompt renders plain until it is long enough to need the scroll box
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

// the topic client builds its api client from window.location when it loads, and the runner has no window.
// the import comes after, so the module graph this file pulls in finds one
Object.assign(globalThis, { window: { location: { origin: "http://localhost" } } })
const { TopicPrompt } = await import("./TopicInfo")

// the character count the component treats as long
const SCROLLING_PROMPT_CHARS = 900

// a prompt of a given length, in words so it wraps the way a written prompt does
const toPrompt = (length: number): string =>
	"Track indoor basketball leagues and open gym runs across the Peninsula. ".repeat(30).slice(0, length)

// a prompt that fits reads as its own paragraph, with no box drawn around it
test("a short prompt renders without the scroll box", () => {
	const html = renderToStaticMarkup(<TopicPrompt prompt={toPrompt(120)} allowedUrls={undefined} />)
	expect(html).toContain("Track indoor basketball leagues")
	expect(html).not.toContain("overflow-y-auto")
})

// past the limit, the prompt scrolls inside the box
test("a long prompt renders inside the scroll box", () => {
	const html = renderToStaticMarkup(<TopicPrompt prompt={toPrompt(1200)} allowedUrls={undefined} />)
	expect(html).toContain("overflow-y-auto")
	expect(html).toContain("max-h-72")

	// the highlight treatment is what makes the box readable as scrollable
	expect(html).toContain("scrollbar-highlight")
	expect(html).toContain("border-primary/50")
})

// the box appears only once the prompt passes the count, not at it
test("the scroll box starts past the prompt length limit", () => {
	const atLimit = renderToStaticMarkup(
		<TopicPrompt prompt={toPrompt(SCROLLING_PROMPT_CHARS)} allowedUrls={undefined} />,
	)
	const pastLimit = renderToStaticMarkup(
		<TopicPrompt prompt={toPrompt(SCROLLING_PROMPT_CHARS + 1)} allowedUrls={undefined} />,
	)
	expect(atLimit).not.toContain("overflow-y-auto")
	expect(pastLimit).toContain("overflow-y-auto")
})

// an empty prompt is a dash, the same placeholder every unset info line uses
test("a topic with no prompt shows a dash", () => {
	expect(renderToStaticMarkup(<TopicPrompt prompt={null} allowedUrls={undefined} />)).toBe("—")
})
