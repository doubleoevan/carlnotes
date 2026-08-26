// chunker tests for the docs sections chat retrieves
import { expect, test } from "bun:test"
import { toSections } from "./docsSync"

// a small page in the docs' shape: frontmatter, an intro, and two sections
const PAGE = `---
title: Teaming up
description: How teams work.
---

An intro paragraph before any heading.

## Create a team

Three ways in.

## Roles

Leaders and members.
`

// the frontmatter title is a heading to start the intro section, and each ## heading gets its own section
test("toSections splits a page into the intro and one section per heading", () => {
	const sections = toSections("teams/teaming-up", PAGE)
	expect(sections.map((section) => section.heading)).toEqual(["Teaming up", "Create a team", "Roles"])
	// the intro leads with the bare title, and a heading's section names its page and heading together
	expect(sections[0]?.content).toBe("Teaming up\n\nAn intro paragraph before any heading.")
	expect(sections[1]?.content).toBe("Teaming up: Create a team\n\nThree ways in.")
})

// a page without frontmatter still chunks, headed by its path
test("toSections falls back to the page path when there is no frontmatter title", () => {
	const sections = toSections("quickstart", "Just words.\n")
	expect(sections).toHaveLength(1)
	expect(sections[0]?.heading).toBe("quickstart")
})

// a heading with nothing under it embeds nothing, including one that ends the file with no newline
test("toSections drops empty sections and survives a heading at the end of the page", () => {
	const sections = toSections("page", "---\ntitle: T\n---\nIntro.\n\n## Empty\n\n   \n\n## Last")
	expect(sections.map((section) => section.heading)).toEqual(["T"])
})

// the hash decides what re-embeds, so it must hold still on identical input and move on any edit
test("toSections hashes deterministically and changes on a one-character edit", () => {
	const [first] = toSections("page", PAGE)
	const [again] = toSections("page", PAGE)
	const [edited] = toSections("page", PAGE.replace("An intro", "An Intro"))
	expect(first?.contentHash).toBe(again?.contentHash ?? "")
	expect(first?.contentHash).not.toBe(edited?.contentHash ?? "")
})

// a ## at line start inside a fenced code block still splits, the known limit of the line-based split
test("toSections splits on a ## inside a code fence, the known limit of the line-based split", () => {
	const fenced = "---\ntitle: T\n---\nIntro.\n\n```md\n## not a heading\n```\n"
	expect(toSections("page", fenced).map((section) => section.heading)).toEqual(["T", "not a heading"])
})
