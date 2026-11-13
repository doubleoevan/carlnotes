// the code block highlighter: a block's lines keep their text and each opens and closes its own spans, code that looks
// like markup stays escaped, a guess reads a long block's start, the editor's class ranges sit over the code's own
// offsets, and a body with only plain text blocks never loads the highlighter
import { expect, test } from "bun:test"
import { Window } from "happy-dom"
import { hasColoredCodeBlock } from "@/hooks/useCodeBlockColors"
import {
	colorCodeBlocks,
	toCodeBlockClassRanges,
	toCodeBlockColorLanguage,
	toColoredCodeLines,
} from "./codeBlockColors"

// a line's text, with its spans dropped and its entities read back
function toLineText(lineHtml: string): string {
	const element = new Window().document.createElement("p")
	element.innerHTML = lineHtml
	return element.textContent ?? ""
}

test("a comment over two lines colors both lines, each closing its own spans", () => {
	// a comment over the first two lines, then a statement
	const lines = toColoredCodeLines("/* one\ntwo */\nconst a = 1", "javascript")
	expect(lines.map(toLineText)).toEqual(["/* one", "two */", "const a = 1"])
	expect(lines[0]).toBe('<span class="hljs-comment">/* one</span>')
	expect(lines[1]).toBe('<span class="hljs-comment">two */</span>')
})

test("code that looks like markup stays escaped text and runs no script", () => {
	// an html block whose code holds a script and an img with a handler
	const code = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
	const lineHtml = toColoredCodeLines(code, "html").join("\n")
	expect(lineHtml).not.toContain("<img")
	expect(lineHtml).not.toContain("<script")
	expect(toLineText(lineHtml)).toBe(code)

	// colored in a rendered body, the block holds no img or script element
	const container = new Window().document.createElement("div")
	container.innerHTML = '<codeblock data-language="html"><p></p></codeblock>'
	const line = container.querySelector("p")
	if (line) {
		line.textContent = code
	}

	// the colored block's text is the code alone
	colorCodeBlocks(container as unknown as HTMLElement)
	expect(container.querySelector("img, script")).toBeNull()
	expect(container.textContent).toBe(code)
})

test("a colored block's blank line keeps the break that gives it its height", () => {
	// a javascript block with a blank line between two lines of code
	const container = new Window().document.createElement("div")
	container.innerHTML = '<codeblock data-language="javascript"><p>const a = 1</p><p><br></p><p>a += 1</p></codeblock>'
	colorCodeBlocks(container as unknown as HTMLElement)
	expect(container.querySelectorAll("p")[1]?.innerHTML).toBe("<br>")
	expect(container.querySelector("span")).not.toBeNull()
})

test("only a body with a code block that is not Plain text loads the highlighter", () => {
	expect(hasColoredCodeBlock('<codeblock data-language="plaintext"><p>plain</p></codeblock><p>words</p>')).toBe(false)
	expect(hasColoredCodeBlock("<p>words</p>")).toBe(false)
	expect(hasColoredCodeBlock("<codeblock><p>const a = 1</p></codeblock>")).toBe(true)
	expect(hasColoredCodeBlock('<codeblock data-language="sql"><p>select 1</p></codeblock>')).toBe(true)
})

test("a block with no language colors in a guessed one, and Plain text and prose color in none", () => {
	// code that reads clearly as one language is guessed as it
	const python = "def pour(cup):\n    for shot in range(2):\n        print(shot)\n    return cup"
	expect(toCodeBlockColorLanguage(python, null)).toBe("python")

	// a named language wins over a guess, and Plain text and a language off the list color in none
	expect(toCodeBlockColorLanguage(python, "sql")).toBe("sql")
	expect(toCodeBlockColorLanguage(python, "plaintext")).toBeNull()
	expect(toCodeBlockColorLanguage(python, "cobol")).toBeNull()

	// a short line of prose fits no language well enough to color
	expect(toCodeBlockColorLanguage("Pour the milk slowly.", null)).toBeNull()
})

test("a guess reads a long block's start, so text typed past it keeps the same guess", () => {
	// a python block past the guess's sample, then the same block with prose added at its end
	const shotLines = Array.from({ length: 80 }, (_, i) => `    total += shot * ${i}  # shot ${i}`).join("\n")
	const python = `def pour(cup):\n    total = 0\n    for shot in range(2):\n${shotLines}\n    return cup`
	expect(python.length).toBeGreaterThan(2000)
	expect(toCodeBlockColorLanguage(python, null)).toBe("python")
	expect(toCodeBlockColorLanguage(`${python}SELECT * FROM shots WHERE id = 1;`, null)).toBe("python")
})

test("the editor's class ranges sit over the code's own offsets, with escaped characters counted once", () => {
	// a keyword, then a string holding characters highlight.js escapes
	const code = 'const a = "<&>"'
	const classRanges = toCodeBlockClassRanges(code, "javascript") ?? []
	expect(classRanges.map(({ from, to, className }) => [code.slice(from, to), className])).toEqual([
		["const", "hljs-keyword"],
		['"<&>"', "hljs-string"],
	])

	// a language off the list colors nothing
	expect(toCodeBlockClassRanges(code, "cobol")).toBeNull()
})
