// the code block highlighter, loaded only for a body with a code block to color: highlight.js's core with only the
// languages a code block's menu offers, the guess of a block's language if it names none, the walk that colors each
// block's lines in place for readers, and the class ranges the editor colors its blocks with
import { type CodeBlockLanguage, isCodeBlockLanguage } from "@carlnotes/contracts/topicPosts"
import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import go from "highlight.js/lib/languages/go"
import java from "highlight.js/lib/languages/java"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import python from "highlight.js/lib/languages/python"
import rust from "highlight.js/lib/languages/rust"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"

// each language a code block may store, by its grammar. highlight.js names html's grammar xml
const LANGUAGE_GRAMMARS: Record<CodeBlockLanguage, Parameters<typeof hljs.registerLanguage>[1]> = {
	bash,
	css,
	go,
	html: xml,
	java,
	javascript,
	json,
	markdown,
	python,
	rust,
	sql,
	typescript,
	yaml,
}
for (const [language, grammar] of Object.entries(LANGUAGE_GRAMMARS)) {
	hljs.registerLanguage(language, grammar)
}

// the languages a guess picks from, the more common in posts first, because a tie goes to the earlier one. TypeScript
// and JavaScript color the same code alike
const GUESSED_LANGUAGES: CodeBlockLanguage[] = [
	"javascript",
	"typescript",
	"python",
	"bash",
	"sql",
	"json",
	"html",
	"css",
	"yaml",
	"go",
	"java",
	"rust",
	"markdown",
]

// the least relevance a guess needs to color a block, which a line of SQL reaches and a sentence of prose does not
const GUESS_MIN_RELEVANCE = 3

// the most characters of a block a guess reads, from its start, so typing in a long block guesses once, and the
// guesses made so far by the code they read
const GUESS_SAMPLE_CHARS = 2000
const guessedLanguages = new Map<string, CodeBlockLanguage | null>()

/**
 * Returns the language a code block is colored in: the language it names, a guess from the start of its code if it
 * names none, or null for Plain text, a language off the list, or code that no guess fits well.
 */
export function toCodeBlockColorLanguage(code: string, language: string | null): CodeBlockLanguage | null {
	// a named language colors in it, and Plain text or a language off the list colors in none
	if (language !== null) {
		return isCodeBlockLanguage(language) ? language : null
	}

	// a guess is made once per sample of the code, and the guesses are cleared all at once past 500
	const guessSample = code.slice(0, GUESS_SAMPLE_CHARS)
	const knownGuess = guessedLanguages.get(guessSample)
	if (knownGuess !== undefined) {
		return knownGuess
	}
	if (guessedLanguages.size > 500) {
		guessedLanguages.clear()
	}

	// the guess counts only if its grammar matched enough of the sample
	const guess = hljs.highlightAuto(guessSample, GUESSED_LANGUAGES)
	const guessedLanguage =
		guess.language && guess.relevance >= GUESS_MIN_RELEVANCE && isCodeBlockLanguage(guess.language)
			? guess.language
			: null
	guessedLanguages.set(guessSample, guessedLanguage)
	return guessedLanguage
}

// an opening span, a closing span, or the text between them in highlight.js's html
const HIGHLIGHT_TOKEN_PATTERN = /(<span [^>]*>)|(<\/span>)|([^<]+)/g

/**
 * Returns a code block's code as highlighted html, one entry per line. highlight.js escapes the code, and each line
 * closes the spans still open at its end and opens them again at the next line's start.
 */
export function toColoredCodeLines(code: string, language: CodeBlockLanguage): string[] {
	// the highlighted html, the lines it splits into, and the spans open at the current point
	const { value } = hljs.highlight(code, { language, ignoreIllegals: true })
	const lines: string[] = []
	const openSpans: string[] = []
	let line = ""
	for (const [, openSpan, closeSpan, text = ""] of value.matchAll(HIGHLIGHT_TOKEN_PATTERN)) {
		// an opening span starts on the current line
		if (openSpan) {
			openSpans.push(openSpan)
			line += openSpan
			continue
		}

		// a closing span ends the innermost open one
		if (closeSpan) {
			openSpans.pop()
			line += closeSpan
			continue
		}

		// each newline in the text ends a line inside the spans open at it
		const [firstText = "", ...nextTexts] = text.split("\n")
		line += firstText
		for (const nextText of nextTexts) {
			lines.push(line + "</span>".repeat(openSpans.length))
			line = openSpans.join("") + nextText
		}
	}

	// the last line ends with the code
	return [...lines, line]
}

/**
 * Colors each code block inside a container in its language or a guessed one, line by line. A block's text stays the
 * same, so nothing moves, and a block already colored is left alone.
 */
export function colorCodeBlocks(container: HTMLElement): void {
	for (const codeBlock of container.querySelectorAll<HTMLElement>("codeblock")) {
		// a block colored before keeps its markup
		if (codeBlock.dataset.colored !== undefined) {
			continue
		}

		// each child is one line, and Plain text, a language off the list, or code no guess fits keeps its plain text
		const lineElements = [...codeBlock.children]
		const code = lineElements.map((element) => element.textContent ?? "").join("\n")
		const language = toCodeBlockColorLanguage(code, codeBlock.dataset.language ?? null)
		if (!language) {
			continue
		}

		// the whole block is highlighted at once, so a comment or a string over lines colors right. a blank line keeps
		// the markup that gives it its height
		const coloredLines = toColoredCodeLines(code, language)
		lineElements.forEach((element, i) => {
			if (element.textContent) {
				element.innerHTML = coloredLines[i] ?? ""
			}
		})

		// a colored block is marked, so a later pass leaves it alone
		codeBlock.dataset.colored = ""
	}
}

// the escaped characters in highlight.js's html, by the character each one stands for
const HTML_ENTITY_PATTERN = /&(amp|lt|gt|quot|#x27);/g

/**
 * Returns the editor's coloring of a code block's code in its language or a guessed one: each highlighted run's class
 * names over its offsets in the code, or null for a block that keeps its plain text.
 */
export function toCodeBlockClassRanges(
	code: string,
	language: string | null,
): { from: number; to: number; className: string }[] | null {
	const colorLanguage = toCodeBlockColorLanguage(code, language)
	if (!colorLanguage) {
		return null
	}

	// the highlighted html, walked with the classes open at the current offset in the code
	const { value } = hljs.highlight(code, { language: colorLanguage, ignoreIllegals: true })
	const classRanges: { from: number; to: number; className: string }[] = []
	const openClassNames: string[] = []
	let offset = 0
	for (const [, openSpan, closeSpan, text = ""] of value.matchAll(HIGHLIGHT_TOKEN_PATTERN)) {
		// a span opens or closes its classes
		if (openSpan) {
			openClassNames.push(/class="([^"]*)"/.exec(openSpan)?.[1] ?? "")
			continue
		}
		if (closeSpan) {
			openClassNames.pop()
			continue
		}

		// a run of text inside any span takes every class open at it
		const length = text.replace(HTML_ENTITY_PATTERN, "_").length
		if (openClassNames.length > 0) {
			classRanges.push({ from: offset, to: offset + length, className: openClassNames.join(" ") })
		}
		offset += length
	}
	return classRanges
}
