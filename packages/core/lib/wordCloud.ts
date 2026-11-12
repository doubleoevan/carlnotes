// the word cloud's words and layout: the words a title holds, and where each word sits, sized by its count, on a spiral
// out from the middle with no two words overlapping. web and mobile draw the same layout
import { type DashboardWord, WORD_CLOUD_WORD_LIMIT } from "@carlnotes/contracts/dashboards"

// common words a title holds that say nothing about it, three letters or longer
const STOPWORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"from",
	"that",
	"this",
	"are",
	"was",
	"were",
	"what",
	"when",
	"how",
	"why",
	"who",
	"its",
	"into",
	"about",
	"your",
	"you",
	"our",
	"has",
	"have",
	"not",
	"but",
	"all",
	"can",
	"will",
	"new",
	"more",
	"than",
	"out",
	"over",
	"after",
	"also",
	"just",
	"now",
	"get",
	"via",
	"they",
	"their",
	"them",
	"his",
	"her",
	"she",
	"one",
	"two",
])

// the shortest word kept
const MIN_WORD_LENGTH = 3

// the smallest and largest font sizes, the width of one character for each point of font size, and a word's height
// for each point of font size
const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 48
const CHARACTER_WIDTH_RATIO = 0.55
const LINE_HEIGHT_RATIO = 0.95

// how far the spiral turns and grows each step, the gap kept between words, and how many steps a word may try
const SPIRAL_ANGLE_STEP = 0.35
const SPIRAL_RADIUS_STEP = 0.6
const WORD_GAP = 1
const MAX_SPIRAL_STEPS = 8000

// a word and its count
type WordCount = Pick<DashboardWord, "word" | "count">

// a laid out word with its count: its middle in the box and its font size, plus its box for hit testing
export type PlacedWord = WordCount & {
	x: number
	y: number
	fontSize: number
	width: number
	height: number
}

/**
 * Returns the distinct words a title holds: lowercased, split on everything that is not a letter, with common words
 * and words under three letters left out.
 */
export function toTitleWords(title: string): string[] {
	const words = title
		.toLowerCase()
		.split(/[^\p{L}]+/u)
		.filter((word) => word.length >= MIN_WORD_LENGTH && !STOPWORDS.has(word))
	return [...new Set(words)]
}

/**
 * Returns the words with the highest counts, up to the word limit, highest first.
 */
export function toTopWords(wordCounts: WordCount[]): WordCount[] {
	return [...wordCounts].sort((first, second) => second.count - first.count).slice(0, WORD_CLOUD_WORD_LIMIT)
}

/**
 * Lays the words out in a box, the highest count first from the middle outward on a spiral, with font sizes between the
 * smallest and the largest by count. A word that finds no free spot inside the box is left out.
 */
export function toPlacedWords(wordCounts: WordCount[], width: number, height: number): PlacedWord[] {
	const topWords = toTopWords(wordCounts)
	const counts = topWords.map(({ count }) => count)
	const [minCount, maxCount] = [Math.min(...counts), Math.max(...counts)]

	// place each word at the first spot on its spiral that overlaps no placed word and stays in the box
	const placedWords: PlacedWord[] = []
	for (const topWord of topWords) {
		const fontSize = toFontSize(topWord.count, minCount, maxCount)
		const wordWidth = topWord.word.length * fontSize * CHARACTER_WIDTH_RATIO
		const wordHeight = fontSize * LINE_HEIGHT_RATIO

		// keep the word if it found a spot
		const spot = findFreeSpot({ placedWords, width, height, wordWidth, wordHeight })
		if (spot) {
			placedWords.push({ ...topWord, ...spot, fontSize, width: wordWidth, height: wordHeight })
		}
	}
	return placedWords
}

// a word's box: its middle, width, and height
type WordBox = Pick<PlacedWord, "x" | "y" | "width" | "height">

/**
 * Returns whether two words' boxes overlap.
 */
export function isOverlapping(first: WordBox, second: WordBox): boolean {
	return (
		Math.abs(first.x - second.x) * 2 < first.width + second.width &&
		Math.abs(first.y - second.y) * 2 < first.height + second.height
	)
}

// a count's font size, scaled between the smallest and the largest by where the count sits between the lowest and the
// highest. every word is the largest size if all counts are the same
function toFontSize(count: number, minCount: number, maxCount: number): number {
	const countShare = maxCount === minCount ? 1 : (count - minCount) / (maxCount - minCount)
	return Math.round(MIN_FONT_SIZE + countShare * (MAX_FONT_SIZE - MIN_FONT_SIZE))
}

// the placed words, the box, and the size of the word to place
type FindFreeSpotOptions = {
	placedWords: PlacedWord[]
	width: number
	height: number
	wordWidth: number
	wordHeight: number
}

// the first spot on a spiral from the middle where the word fits in the box and overlaps no placed word, or null
function findFreeSpot({
	placedWords,
	width,
	height,
	wordWidth,
	wordHeight,
}: FindFreeSpotOptions): { x: number; y: number } | null {
	for (let step = 0; step < MAX_SPIRAL_STEPS; step++) {
		// the spiral's point, stretched to the box's shape so the cloud fills a wide box
		const angle = step * SPIRAL_ANGLE_STEP
		const radius = step * SPIRAL_RADIUS_STEP
		const x = width / 2 + radius * Math.cos(angle) * (width / height)
		const y = height / 2 + radius * Math.sin(angle)

		// a spot that leaves the box or overlaps a placed word, with the gap, is skipped.
		// ponytail: each step checks every placed word, fine for the word limit a cloud holds. index the words by grid
		// cell if the limit grows
		const isInBox =
			x - wordWidth / 2 >= 0 && x + wordWidth / 2 <= width && y - wordHeight / 2 >= 0 && y + wordHeight / 2 <= height
		const candidate = { x, y, width: wordWidth + WORD_GAP, height: wordHeight + WORD_GAP }
		if (isInBox && !placedWords.some((placedWord) => isOverlapping(candidate, placedWord))) {
			return { x, y }
		}
	}

	// no spot on the spiral fits the word
	return null
}
