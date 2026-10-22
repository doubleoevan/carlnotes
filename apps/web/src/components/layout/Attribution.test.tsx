// the persona credit's links sit inside a sentence, so each one takes the faint underline that shows at rest
import { expect, test } from "bun:test"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { toElementClassNames } from "@/components/markupTestFixtures"
import { Attribution } from "./Attribution"

// every link in the credit takes sentence-link
test("every link in the persona credit takes sentence-link", async () => {
	const attributionHtml = await renderWithRouter(<Attribution />)
	const anchorClasses = toElementClassNames(attributionHtml, "a")
	expect(anchorClasses).toHaveLength(4)
	expect(anchorClasses.every((className) => className.split(" ").includes("sentence-link"))).toBe(true)
})

// the credit ends in a period, and the call to action follows on its own centered line
test("the persona credit ends in a period over a centered call to action", async () => {
	const attributionHtml = await renderWithRouter(<Attribution />)
	expect(attributionHtml).toContain("Clief Notes</a>.</p>")
	expect(attributionHtml).toContain('<p class="mt-1.5 text-center">Go learn from him. Carl did.</p>')
})
