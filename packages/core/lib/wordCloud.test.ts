// word cloud tests: title words leave out common and short words, the cloud keeps up to the word limit, and no two
// words overlap
import { expect, test } from "bun:test"
import { isOverlapping, toPlacedWords, toTitleWords, toTopWords } from "./wordCloud"

test("a title's words are lowercased and distinct, without common words or words under three letters", () => {
	expect(toTitleWords("The Solar Grid: solar AI and the Rise of Heat-Pumps in Zürich")).toEqual([
		"solar",
		"grid",
		"rise",
		"heat",
		"pumps",
		"zürich",
	])
})

test("the cloud keeps the 60 words with the highest counts", () => {
	const wordCounts = Array.from({ length: 80 }, (_, i) => ({ word: `word${i}`, count: i }))
	const topWords = toTopWords(wordCounts)
	expect(topWords).toHaveLength(60)
	expect(topWords[0]?.word).toBe("word79")
})

test("a layout places words inside the box with no two overlapping", () => {
	const wordCounts = Array.from({ length: 60 }, (_, i) => ({ word: `word${i}`, count: 60 - i }))
	const placedWords = toPlacedWords(wordCounts, 600, 320)
	expect(placedWords.length).toBeGreaterThan(20)
	for (const [i, placedWord] of placedWords.entries()) {
		// each word stays in the box and clear of every word after it
		expect(placedWord.x - placedWord.width / 2).toBeGreaterThanOrEqual(0)
		expect(placedWord.x + placedWord.width / 2).toBeLessThanOrEqual(600)
		expect(placedWords.slice(i + 1).some((otherWord) => isOverlapping(placedWord, otherWord))).toBe(false)
	}
})
