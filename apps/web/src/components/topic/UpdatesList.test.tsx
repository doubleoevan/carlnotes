// the shared list: its sections, its empty state, and the platform's rows
import { expect, test } from "bun:test"
import { EMPTY_UPDATES_TEXT, UPDATES_TITLE } from "@carlnotes/contracts/updates"
import { UpdatesList, type UpdatesListElements } from "@carlnotes/core/components/UpdatesList"
import { UPDATES_STORY } from "@carlnotes/core/lib/updatesStories"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// plain elements, so the markup holds only what the composition chose to show
const Box = ({ children }: { children: ReactNode }) => <div>{children}</div>
const ELEMENTS: UpdatesListElements = {
	Card: Box,
	Heading: ({ children }) => <h1>{children}</h1>,
	Opener: Box,
	EmptyState: Box,
}

// the rows a platform passes in
const FINDINGS = <ol>rows</ol>

// the markup of a list
function toUpdatesMarkup(updates: typeof UPDATES_STORY): string {
	return renderToStaticMarkup(<UpdatesList updates={updates} findings={FINDINGS} elements={ELEMENTS} />)
}

test("a list shows its opener and the platform's rows, and no link to what did not fit", () => {
	const markup = toUpdatesMarkup(UPDATES_STORY)
	expect(markup).toContain(UPDATES_STORY.opener as string)
	expect(markup).toContain("<ol>rows</ol>")
	expect(markup).not.toContain("and 12 more")
})

test("a list without an opener starts at its rows, and an empty list shows its line alone in the card", () => {
	const markup = toUpdatesMarkup({ ...UPDATES_STORY, opener: null })
	expect(markup).toBe(`<div><h1>${UPDATES_TITLE}</h1><ol>rows</ol></div>`)
	expect(toUpdatesMarkup({ ...UPDATES_STORY, findings: [], moreCount: 0 })).toBe(
		`<div><h1>${UPDATES_TITLE}</h1><div>${EMPTY_UPDATES_TEXT}</div></div>`,
	)
})

test("the card shows its heading and the placeholder until the list loads", () => {
	const markup = renderToStaticMarkup(<UpdatesList placeholder="Loading" elements={ELEMENTS} />)
	expect(markup).toBe(`<div><h1>${UPDATES_TITLE}</h1>Loading</div>`)
})
