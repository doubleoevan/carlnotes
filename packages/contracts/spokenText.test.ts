// the plain-words pass, the spoken parts carl reads aloud, and a streaming reply's spoken parts as they finish
import { expect, test } from "bun:test"
import {
	FIRST_SPOKEN_PART_CHARS,
	SPOKEN_PART_PACKED_CHARS,
	toFinishedSpokenParts,
	toFirstSpokenPartEnd,
	toPlainText,
	toSpokenParts,
	toUnfinishedSpokenParts,
} from "./spokenText"
import { toOneLineText } from "./text"

// a link keeps its text, and the marks for emphasis, code, headings, quotes, and lists go
test("toPlainText writes markdown as plain words", () => {
	const markdown =
		"## This week\n\n- **Agents** ship [a new SDK](https://example.com) with `tools`.\n> A *quiet* week.\n1. Done."
	expect(toPlainText(markdown)).toBe("This week\n\nAgents ship a new SDK with tools.\nA quiet week.\nDone.")
	expect(toPlainText("5 * 3 = 15, and 2*x stays")).toBe("5 * 3 = 15, and 2*x stays")
})

// the native card keeps image alt text and line-break words in its plain preview
test("plain finding previews retain links, images, emphasis, headings, lists, and code words", () => {
	const review =
		"# Notes\n![coffee beans](https://example.com/beans.png)\n- **Roast** with *care* and `time`.\n[Read more](https://example.com)"
	expect(toOneLineText(toPlainText(review))).toBe("Notes coffee beans Roast with care and time. Read more")
	expect(toPlainText("")).toBe("")
	expect(toOneLineText(toPlainText("First\n\nsecond\r\nthird"))).toBe("First second third")
})

// fenced code and bare urls are never read aloud, link text is, and each paragraph reads as one spoken part
test("toSpokenParts drops fenced code and bare urls and keeps the paragraph breaks", () => {
	const reply =
		"Try it like this:\n\n```ts\nconst x = 1\n\nconst y = 2\n```\n\nRead [the docs](https://example.com/docs) or https://example.com/more\nfor the\n  rest."
	expect(toSpokenParts(reply)).toEqual(["Try it like this:", "Read the docs or for the rest."])
})

// an unclosed fence at the end of a streamed paragraph is dropped to the end
test("toSpokenParts drops an unclosed fence", () => {
	expect(toSpokenParts("Here:\n\n```\nconst x = 1")).toEqual(["Here:"])
})

// spoken parts split on blank lines, with the empty ones dropped
test("toSpokenParts splits a reply on blank lines and drops empty ones", () => {
	expect(toSpokenParts("First.\n\n   \n\nSecond\nline.\n\n")).toEqual(["First.", "Second line."])
	expect(toSpokenParts("")).toEqual([])
})

// a tight list flattens to one paragraph of lines, which packs into spoken parts within the limit with every word kept
test("toSpokenParts splits a long tight list at its lines", () => {
	const listItems = Array.from({ length: 50 }, (_, i) => `Item ${i} says something worth reading aloud today.`)
	const spokenParts = toSpokenParts(listItems.map((item) => `- ${item}`).join("\n"))
	expect(listItems.join("\n").length).toBeGreaterThan(SPOKEN_PART_PACKED_CHARS)
	expect(spokenParts.length).toBeGreaterThan(1)
	expect(spokenParts.every((spokenPart) => spokenPart.length <= SPOKEN_PART_PACKED_CHARS)).toBe(true)
	expect(spokenParts.join(" ")).toBe(listItems.join(" "))
})

// a long paragraph of sentences breaks at sentence ends, so every spoken part ends on one
test("toSpokenParts splits a long paragraph at sentence ends", () => {
	const sentences = Array.from({ length: 100 }, (_, i) => `Sentence number ${i} is here.`)
	const spokenParts = toSpokenParts(sentences.join(" "))
	expect(sentences.join(" ").length).toBeGreaterThan(SPOKEN_PART_PACKED_CHARS)
	expect(spokenParts.length).toBeGreaterThan(1)
	expect(
		spokenParts.every((spokenPart) => spokenPart.length <= SPOKEN_PART_PACKED_CHARS && spokenPart.endsWith(".")),
	).toBe(true)
	expect(spokenParts.join(" ")).toBe(sentences.join(" "))
})

// a stretch of text with no space to break at is cut at the packed length, so every spoken part stays short
test("toSpokenParts cuts a long stretch of text with no spaces at the packed length", () => {
	const unbrokenText = "x".repeat(SPOKEN_PART_PACKED_CHARS + 100)
	expect(toSpokenParts(unbrokenText)).toEqual([
		unbrokenText.slice(0, SPOKEN_PART_PACKED_CHARS),
		unbrokenText.slice(SPOKEN_PART_PACKED_CHARS),
	])
})

// a paragraph that fits stays whole, and a paragraph of words with no sentence end breaks at a space
test("toSpokenParts keeps a paragraph within the packed length whole and bounds the rest", () => {
	const paragraph = "word ".repeat(80).trim()
	expect(toSpokenParts(paragraph)).toEqual([paragraph])

	// the words past the packed length go to a second spoken part, with no word lost
	const longWords = "word ".repeat(150).trim()
	const spokenParts = toSpokenParts(longWords)
	expect(spokenParts.length).toBe(2)
	expect(spokenParts.every((spokenPart) => spokenPart.length <= SPOKEN_PART_PACKED_CHARS)).toBe(true)
	expect(spokenParts.join(" ")).toBe(longWords)
})

// a reply's first spoken part ends at its first sentence end past the short length, so carl starts talking sooner, and
// the rest of the paragraph is the next spoken part
test("toSpokenParts starts with a short first spoken part", () => {
	const firstSentences = "Short one. This second sentence takes the first spoken part past sixty characters."
	const reply = `${firstSentences} Then a third sentence follows. And a fourth.\n\nNext paragraph.`
	expect(toSpokenParts(reply)).toEqual([
		firstSentences,
		"Then a third sentence follows. And a fourth.",
		"Next paragraph.",
	])
})

// the first spoken part ends just past a sentence end at or past the short length that the next space confirms, never
// at a list number, and never inside an open fence
test("toFirstSpokenPartEnd finds the first sentence end past the short length", () => {
	const longSentence = `${"a".repeat(FIRST_SPOKEN_PART_CHARS)}.`
	expect(toFirstSpokenPartEnd(`Short. ${longSentence} More.`)).toBe(`Short. ${longSentence}`.length)
	expect(toFirstSpokenPartEnd(longSentence)).toBeNull()
	expect(toFirstSpokenPartEnd(`Short.\n\n${longSentence} More.`)).toBeNull()
	expect(toFirstSpokenPartEnd(`${"a".repeat(FIRST_SPOKEN_PART_CHARS)} 1. item`)).toBeNull()
	expect(toFirstSpokenPartEnd(`\`\`\`ts ${longSentence} More.`)).toBeNull()
})

// a spoken part with no letter or digit, like a horizontal rule, is never sent to be spoken
test("toSpokenParts drops a spoken part with no words", () => {
	expect(toSpokenParts("First.\n\n---\n\nSecond.")).toEqual(["First.", "Second."])
})

// each finished paragraph becomes a spoken part as the stream passes its blank line, and the unfinished tail waits
test("toFinishedSpokenParts splits the finished paragraphs and keeps the tail", () => {
	const answer = "First point.\n\nSecond **point** with a [link](https://a.example).\n\nStill writ"
	const { spokenParts, spokenPartStart } = toFinishedSpokenParts(answer, 0)
	expect(spokenParts).toEqual(["First point.", "Second point with a link."])
	expect(answer.slice(spokenPartStart)).toBe("Still writ")

	// a later call starts where the last one stopped, and finds nothing new until the next blank line
	expect(toFinishedSpokenParts(`${answer}ing.`, spokenPartStart)).toEqual({ spokenParts: [], spokenPartStart })
	const finishedSpokenParts = toFinishedSpokenParts(`${answer}ing.\n\n`, spokenPartStart)
	expect(finishedSpokenParts.spokenParts).toEqual(["Still writing."])
	expect(finishedSpokenParts.spokenPartStart).toBe(`${answer}ing.\n\n`.length)
})

// a paragraph that is only a url speaks nothing, so it is dropped instead of appended as an empty spoken part
test("toFinishedSpokenParts drops a paragraph with no words to speak", () => {
	expect(toFinishedSpokenParts("https://a.example\n\nWords.\n\n", 0).spokenParts).toEqual(["Words."])
})

// a code block that is still open holds its paragraphs back, so the fence never splits into spoken halves
test("toFinishedSpokenParts waits for an open fence to close", () => {
	const openFence = "Look:\n\n```js\nconst a = 1\n\nconst b = 2\n"
	expect(toFinishedSpokenParts(openFence, 0)).toEqual({ spokenParts: [], spokenPartStart: 0 })

	// once the fence closes, the code is dropped and the words around it speak
	const { spokenParts } = toFinishedSpokenParts(`${openFence}\`\`\`\n\nDone.\n\n`, 0)
	expect(spokenParts).toEqual(["Look:", "Done."])
})

// a one-paragraph reply finishes its short first spoken part while it streams, and the stream's spoken parts match a
// replay's, so a replay reads the audio the stream cached
test("toFinishedSpokenParts finishes the first spoken part of a one-paragraph reply before it ends", () => {
	const reply =
		"Carl has a few things to say. The second sentence takes it past sixty. A third one follows. And a fourth."

	// stream the reply one character at a time, keeping each spoken part as it finishes
	let spokenPartStart = 0
	const streamedSpokenParts: string[] = []
	for (let end = 1; end <= reply.length; end += 1) {
		const finishedSpokenParts = toFinishedSpokenParts(reply.slice(0, end), spokenPartStart)
		spokenPartStart = finishedSpokenParts.spokenPartStart
		streamedSpokenParts.push(...finishedSpokenParts.spokenParts)
	}
	expect(streamedSpokenParts).toEqual(["Carl has a few things to say. The second sentence takes it past sixty."])

	// the finish speaks the rest, and the whole matches what a replay splits
	streamedSpokenParts.push(...toUnfinishedSpokenParts(reply, spokenPartStart))
	expect(streamedSpokenParts).toEqual(toSpokenParts(reply))
	expect(streamedSpokenParts).toEqual([
		"Carl has a few things to say. The second sentence takes it past sixty.",
		"A third one follows. And a fourth.",
	])
})
