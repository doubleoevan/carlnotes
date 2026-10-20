// markdown as plain words, and the spoken parts carl speaks, one per paragraph
import { toOneLineText } from "./text"

// the length spoken parts are packed to, under the speech route's SPOKEN_PART_CHARS, so one speech call returns about
// half a minute of audio
export const SPOKEN_PART_PACKED_CHARS = 500

// how long a reply's first spoken part runs before it ends at a sentence end, so carl's first word comes while the rest
// of the reply is still on its way
export const FIRST_SPOKEN_PART_CHARS = 60

// a blank line between paragraphs
const BLANK_LINE_PATTERN = /\n[ \t]*\n/g

// a sentence end: its punctuation, an optional closing quote or bracket, and the space after it. a number's period is
// not one, so a numbered list keeps its numbers
const SENTENCE_END_PATTERN = /(?<!\d)[.!?]["')\]]?(?=\s)/g

/**
 * Returns markdown as its plain words. A link or image keeps its text, and the marks for bold, star emphasis, code,
 * headings, quotes, and lists go.
 */
export function toPlainText(markdown: string): string {
	return markdown
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\*\*|__|`/g, "")
		.replace(/\*(\S[^*]*?)\*/g, "$1")
		.replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
}

/**
 * Returns the spoken parts carl speaks for a markdown reply: a short first spoken part that ends at the first sentence
 * end past FIRST_SPOKEN_PART_CHARS, then one spoken part per paragraph, as toParagraphSpokenParts splits them.
 */
export function toSpokenParts(markdown: string): string[] {
	// a reply with no sentence end past the short length splits by paragraph alone
	const firstSpokenPartEnd = toFirstSpokenPartEnd(markdown)
	if (firstSpokenPartEnd === null) {
		return toParagraphSpokenParts(markdown)
	}
	return [
		...toParagraphSpokenParts(markdown.slice(0, firstSpokenPartEnd)),
		...toParagraphSpokenParts(markdown.slice(firstSpokenPartEnd)),
	]
}

/**
 * Returns the spoken parts carl speaks for markdown: its plain words with fenced code and bare urls removed, one spoken
 * part per paragraph split on blank lines, with the spoken parts that have no letter or digit dropped. A paragraph over
 * SPOKEN_PART_PACKED_CHARS becomes several spoken parts.
 */
export function toParagraphSpokenParts(markdown: string): string[] {
	// drop fenced code, an unclosed fence to the end, before the plain-words pass strips its backticks
	const spokenWords = toPlainText(markdown.replace(/```[\s\S]*?(?:```|$)/g, "")).replace(/https?:\/\/\S+/g, "")
	return spokenWords
		.split(BLANK_LINE_PATTERN)
		.flatMap(toPackedSpokenParts)
		.filter((spokenPart) => /[\p{L}\p{N}]/u.test(spokenPart))
}

/**
 * Returns where a reply's short first spoken part ends: just past the first sentence end in its first paragraph at or
 * past FIRST_SPOKEN_PART_CHARS, or null if there is none yet or a code fence is open before it.
 */
export function toFirstSpokenPartEnd(markdown: string): number | null {
	// the first sentence end of the first paragraph at or past the short length
	const firstParagraph = markdown.split(BLANK_LINE_PATTERN, 1)[0] ?? ""
	for (const sentenceEnd of firstParagraph.matchAll(SENTENCE_END_PATTERN)) {
		const spokenPartEnd = sentenceEnd.index + sentenceEnd[0].length
		if (spokenPartEnd < FIRST_SPOKEN_PART_CHARS) {
			continue
		}

		// an open fence before the sentence end keeps the paragraph whole
		return isFenceOpen(firstParagraph.slice(0, spokenPartEnd)) ? null : spokenPartEnd
	}
	return null
}

// whether a fenced code block is still open at the end of the text
function isFenceOpen(text: string): boolean {
	return (text.match(/```/g) ?? []).length % 2 === 1
}

/**
 * Returns a paragraph packed into spoken parts at most SPOKEN_PART_PACKED_CHARS long. Its pieces, split at its lines
 * and its sentence ends, join the spoken part before them while the spoken part fits. A piece over the length is cut at
 * its last space before the length, or at the length itself if it has no space.
 */
function toPackedSpokenParts(paragraph: string): string[] {
	// each piece as one line of words, with the empty pieces dropped
	const pieces = paragraph
		.split(/\n|(?<=[.!?]) /)
		.map((piece) => toOneLineText(piece))
		.filter((piece) => piece !== "")

	// pack the pieces into spoken parts within the length
	const spokenParts: string[] = []
	for (const piece of pieces) {
		// a piece joins the spoken part before it if the pair fits
		const lastSpokenPart = spokenParts.at(-1)
		if (lastSpokenPart !== undefined && lastSpokenPart.length + 1 + piece.length <= SPOKEN_PART_PACKED_CHARS) {
			spokenParts[spokenParts.length - 1] = `${lastSpokenPart} ${piece}`
			continue
		}

		// a piece over the length is cut at its last space before the length, or at the length if it has no space
		let remainingPiece = piece
		while (remainingPiece.length > SPOKEN_PART_PACKED_CHARS) {
			const spaceIndex = remainingPiece.lastIndexOf(" ", SPOKEN_PART_PACKED_CHARS)
			const cutIndex = spaceIndex === -1 ? SPOKEN_PART_PACKED_CHARS : spaceIndex
			spokenParts.push(remainingPiece.slice(0, cutIndex))
			remainingPiece = remainingPiece.slice(cutIndex).trimStart()
		}

		// the piece's last cut, or the whole piece if it was within the length, starts a new spoken part
		spokenParts.push(remainingPiece)
	}
	return spokenParts
}

/**
 * Returns a streaming answer's spoken parts that finished since the last call, and where the next unfinished spoken
 * part starts. The answer's first spoken part finishes at its first sentence end past FIRST_SPOKEN_PART_CHARS, as
 * toSpokenParts splits it, and the rest finish on blank lines. A fenced code block that is still open holds its
 * paragraphs back until it closes.
 */
export function toFinishedSpokenParts(
	answer: string,
	spokenPartStart: number,
): { spokenParts: string[]; spokenPartStart: number } {
	// before any blank line, only the answer's short first spoken part can finish
	const pendingAnswer = answer.slice(spokenPartStart)
	const lastBlankLine = [...pendingAnswer.matchAll(BLANK_LINE_PATTERN)].at(-1)
	if (lastBlankLine === undefined) {
		const firstSpokenPartEnd = spokenPartStart === 0 ? toFirstSpokenPartEnd(answer) : null
		return firstSpokenPartEnd === null
			? { spokenParts: [], spokenPartStart }
			: {
					spokenParts: toParagraphSpokenParts(answer.slice(0, firstSpokenPartEnd)),
					spokenPartStart: firstSpokenPartEnd,
				}
	}

	// an open fence holds the finished part back until the fence closes
	const finishedAnswer = pendingAnswer.slice(0, lastBlankLine.index)
	if (isFenceOpen(finishedAnswer)) {
		return { spokenParts: [], spokenPartStart }
	}

	// the finished part's spoken parts, and where the unfinished part starts
	return {
		spokenParts: toSpokenPartsFrom(finishedAnswer, spokenPartStart),
		spokenPartStart: spokenPartStart + lastBlankLine.index + lastBlankLine[0].length,
	}
}

/**
 * Returns the spoken parts of a finished answer that toFinishedSpokenParts had not returned, from where the next
 * unfinished spoken part starts.
 */
export function toUnfinishedSpokenParts(answer: string, spokenPartStart: number): string[] {
	return toSpokenPartsFrom(answer.slice(spokenPartStart), spokenPartStart)
}

// the spoken parts of a part of an answer: split like a whole reply if the part is the answer's start, so a replay
// splits it the same way, and by paragraph alone after that
function toSpokenPartsFrom(answerPart: string, spokenPartStart: number): string[] {
	return spokenPartStart === 0 ? toSpokenParts(answerPart) : toParagraphSpokenParts(answerPart)
}
