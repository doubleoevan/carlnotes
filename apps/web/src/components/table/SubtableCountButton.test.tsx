// the subtable count button's accessible name ends with the count it shows, so a voice user can say what they see
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SubtableCountButton } from "./SubtableCountButton"

// the name ends with the visible count, and a zero count disables the button with no chevron
test("the accessible name ends with the visible count", () => {
	// a team's three members, closed
	const buttonHtml = renderToStaticMarkup(
		<SubtableCountButton count={3} isOpen={false} ariaLabel="Show Reading Group's members" onClick={() => {}} />,
	)
	expect(buttonHtml).toContain('aria-label="Show Reading Group&#x27;s members, 3"')
	expect(buttonHtml).toContain(">3<")

	// an empty subtable, which nothing opens
	const emptyHtml = renderToStaticMarkup(
		<SubtableCountButton count={0} isOpen={false} ariaLabel="Show Reading Group's topics" onClick={() => {}} />,
	)
	expect(emptyHtml).toContain('aria-label="Show Reading Group&#x27;s topics, 0"')
	expect(emptyHtml).toContain("disabled")
	expect(emptyHtml).not.toContain("<svg")
})
