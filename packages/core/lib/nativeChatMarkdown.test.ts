import { expect, test } from "bun:test"
import { toNativeChatMarkdown } from "./nativeChatMarkdown"
import { isSafeHref, NEW_TOPIC_CHAT_HREF, NEW_TOPIC_CHAT_WORDS } from "./safeChatMarkdown"

test("native answers keep raw HTML literal and remove media and unsafe link actions", () => {
	const segments = toNativeChatMarkdown(
		"<script>alert(1)</script> ![picture](https://example.com/a.png) [bad](javascript:alert(1)) [data](data:text/html,hi)",
	)
	const text = JSON.stringify(segments)
	expect(text).toContain("\\\\<script\\\\>")
	expect(text).not.toContain("javascript:")
	expect(text).not.toContain("data:text")
	expect(text).toContain("[picture](https://example.com/a.png)")
	expect(text).not.toContain("![picture]")
})

test("reference links, encoded schemes and code stay under the shared web link policy", () => {
	const text = JSON.stringify(
		toNativeChatMarkdown(
			"[safe][yes] [bad][no] [entity](javascript&#58;alert) `javascript:alert(1)`\n\n[yes]: https://example.com/a(b)\n[no]: javascript:alert(1)",
		),
	)
	expect(text).toContain("[safe](https://example.com/a%28b%29)")
	expect(text).not.toContain("[bad](")
	expect(text).not.toContain("[entity](")
	expect(text).toContain("` javascript:alert(1) `")
	expect(isSafeHref("mailto:person@example.com")).toBe(false)
	expect(isSafeHref("https://example.com")).toBe(true)
})

test("native links preserve percent escapes while encoding Markdown destination delimiters", () => {
	// preserve the destination's escaped query and encode its literal parentheses
	const markdownSegments = toNativeChatMarkdown("[Search](https://example.com/a(b)?q=cold%20brew&path=%2Fnotes)")
	expect(markdownSegments).toEqual([
		{ kind: "markdown", markdown: "[Search](https://example.com/a%28b%29?q=cold%20brew&path=%2Fnotes)\n\n" },
	])
})

test("the new-topic invitation links to the new-topic chat and escaped entities cannot become HTML", () => {
	const result = toNativeChatMarkdown(`${NEW_TOPIC_CHAT_WORDS}\n\n&lt;img src=x onerror=alert(1)&gt;`)
	expect(result[0]).toEqual({
		kind: "markdown",
		markdown: expect.stringContaining(`](${NEW_TOPIC_CHAT_HREF})`),
	})
	expect(JSON.stringify(result)).toContain("\\\\<img")
})

test("another fragment, a script link, and an invitation split mid-stream stay inert", () => {
	// another fragment and a script link
	const otherFragment = JSON.stringify(toNativeChatMarkdown("[Jump](#other)"))
	expect(otherFragment).not.toContain("](")
	const scriptLink = JSON.stringify(toNativeChatMarkdown("[Run](javascript:alert(1))"))
	expect(scriptLink).not.toContain("](")
	// the invitation's words and its link, each cut off mid-stream
	const splitInvitation = JSON.stringify(toNativeChatMarkdown(NEW_TOPIC_CHAT_WORDS.slice(0, 20), true))
	expect(splitInvitation).not.toContain(NEW_TOPIC_CHAT_HREF)
	const splitLink = JSON.stringify(toNativeChatMarkdown("[Make one](#new-topic-ch", true))
	expect(splitLink).not.toContain("](")
})

test("table cards preserve header order, formatting, escaped pipes, empty cells and safe links", () => {
	const result = toNativeChatMarkdown(
		"| Name | Detail |\n|---|---|\n| **Carl** | a \\| b |\n| [Site](https://example.com) | |\n",
	)
	expect(result).toEqual([
		{
			kind: "table",
			rows: [
				[
					{ label: "Name", value: "**Carl**" },
					{ label: "Detail", value: "a \\| b" },
				],
				[
					{ label: "Name", value: "[Site](https://example.com)" },
					{ label: "Detail", value: "" },
				],
			],
		},
	])
})

test("an unfinished table row waits for all columns and its boundary before becoming a card", () => {
	const table = "| Name | Detail |\n|---|---|\n| Carl | ready |\n| Vienna |"
	expect(toNativeChatMarkdown(table, true)[0]).toMatchObject({
		rows: [
			[
				{ label: "Name", value: "Carl" },
				{ label: "Detail", value: "ready" },
			],
		],
	})
	expect(toNativeChatMarkdown(`${table} next |`, true)[0]).toMatchObject({
		rows: [
			expect.any(Array),
			[
				{ label: "Name", value: "Vienna" },
				{ label: "Detail", value: "next" },
			],
		],
	})
})

test("every prefix of hostile streamed Markdown remains free of unsafe actions or image syntax", () => {
	const input = '[bad](javascript:alert(1)) ![pixel](https://example.com/pixel) <video src="x"> &lt;iframe&gt;'
	for (let length = 1; length <= input.length; length += 1) {
		const text = JSON.stringify(toNativeChatMarkdown(input.slice(0, length), true))
		expect(text).not.toMatch(/\]\((?:javascript|data|file):/)
		expect(text).not.toContain("![pixel](")
	}
})

test("a completed streamed table row with emoji appears before the final newline", () => {
	// recognize the closing delimiter independently of UTF-16 character widths
	const markdownSegments = toNativeChatMarkdown("| Name | Detail |\n|---|---|\n| Carl 🦝 | ready |", true)
	expect(markdownSegments).toEqual([
		{
			kind: "table",
			rows: [
				[
					{ label: "Name", value: "Carl 🦝" },
					{ label: "Detail", value: "ready" },
				],
			],
		},
	])
})

test("native ordered lists retain the first number in the answer", () => {
	expect(toNativeChatMarkdown("3. Third step\n4. Fourth step")).toEqual([
		{ kind: "markdown", markdown: "3. Third step\n4. Fourth step\n\n" },
	])
})

test("unsupported frontmatter and footnotes remain readable literal text", () => {
	// preserve source characters while preventing a second parser from treating them as markup
	expect(toNativeChatMarkdown("---\ntitle: <script>\n---\nHello")).toEqual([
		{ kind: "markdown", markdown: "\\-\\-\\-\ntitle: \\<script\\>\n\\-\\-\\-\n\nHello\n\n" },
	])
	expect(toNativeChatMarkdown("A footnote[^one].\n\n[^one]: <script>alert(1)</script>")).toEqual([
		{
			kind: "markdown",
			markdown: "A footnote\\[^one\\].\n\n\\[^one\\]: \\<script\\>alert\\(1\\)\\</script\\>\n\n",
		},
	])
})

test("multiple footnotes render each definition once", () => {
	// preserve both definitions without repeating the shared footnote collection
	const markdownSegments = toNativeChatMarkdown(
		"First[^one] and second[^two].\n\n[^one]: First source\n[^two]: Second source",
	)
	const serializedMarkdown = JSON.stringify(markdownSegments)
	expect(serializedMarkdown.match(/First source/g)).toHaveLength(1)
	expect(serializedMarkdown.match(/Second source/g)).toHaveLength(1)
})

test.each([1, 10])("nested bullets stay inside ordered item %i", (firstNumber) => {
	// retain the parent text, nested records, and next numbered sibling
	const indent = " ".repeat(String(firstNumber).length + 2)
	const markdownSegments = toNativeChatMarkdown(
		`${firstNumber}. Parent\n${indent}- Child\n${indent}- Another child\n${firstNumber + 1}. Next`,
	)
	expect(markdownSegments).toEqual([
		{
			kind: "markdown",
			markdown: `${firstNumber}. Parent\n${indent}- Child\n${indent}- Another child\n${firstNumber + 1}. Next\n\n`,
		},
	])
})

test("nested quotes and code keep their own block boundary in a list", () => {
	// separate block content from the parent item's inline text
	expect(toNativeChatMarkdown("1. Parent\n   > Quoted\n2. Next")).toEqual([
		{ kind: "markdown", markdown: "1. Parent\n   > Quoted\n2. Next\n\n" },
	])
	expect(toNativeChatMarkdown("1. Parent\n   ```\n   code\n   ```\n2. Next")).toEqual([
		{ kind: "markdown", markdown: "1. Parent\n   ```\n   code\n   ```\n2. Next\n\n" },
	])
})
