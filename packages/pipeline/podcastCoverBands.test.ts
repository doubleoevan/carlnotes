// podcast cover band tests: a show title's size steps and a band's tone over a picture's brightness
import { expect, test } from "bun:test"
import { toCoverBandTone, toPodcastCoverTitleFontSize } from "./podcastCoverBands"

test("a title's size steps down as the title gets longer", () => {
	// a title at each step
	const titleSizes = ["Home espresso", "Emerging menswear designers", "x".repeat(60)].map(toPodcastCoverTitleFontSize)
	expect(titleSizes).toEqual([260, 180, 120])
})

// a band leans dark, and turns light only over a bright picture
test("a band's tone follows the brightness under it", () => {
	expect([0.1, 0.5, 0.7, 0.85].map(toCoverBandTone)).toEqual(["dark", "dark", "dark", "light"])
})
