// theme song lyrics tests: the sections that the theme song's note shows, from made-up lines
import { expect, test } from "bun:test"
import { toLyricsSections } from "./themeSongLyrics"

// a blank line starts a section, and each section's first line is its heading
test("toLyricsSections splits the lyrics at blank lines and heads each section with its first line", () => {
	const lyrics = "Verse 1\nA made-up first line\nA made-up second line\n\n  \nChorus\nA made-up refrain\n"
	expect(toLyricsSections(lyrics)).toEqual([
		{ heading: "Verse 1", lines: ["A made-up first line", "A made-up second line"] },
		{ heading: "Chorus", lines: ["A made-up refrain"] },
	])
})

// no lyrics shows no sections
test("toLyricsSections returns no sections for empty lyrics", () => {
	expect(toLyricsSections("")).toEqual([])
})
