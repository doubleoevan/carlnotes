// render tests for the footer's link rows and the component browser link
import { expect, test } from "bun:test"
import { hasSubstringsInOrder } from "@carlnotes/contracts/textOrderTestFixtures"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { Footer } from "./Footer"

// the link row, then the legal row beneath it, each in its order
test("the footer renders its link row and then its legal row", async () => {
	const footerHtml = await renderWithRouter(<Footer />)
	const footerLinkTexts = [
		"What CarlNotes Is",
		"Releases",
		"Source Code",
		"Nightshift Design System",
		"License",
		"Privacy",
		"Terms",
	].map((label) => `>${label}</a>`)
	expect(hasSubstringsInOrder(footerHtml, footerLinkTexts)).toBe(true)
})

// the component browser link is a plain anchor that opens in a new tab
test("the Nightshift Design System link opens /nightshift/ in a new tab", async () => {
	const footerHtml = await renderWithRouter(<Footer />)
	expect(footerHtml).toMatch(
		/<a href="\/nightshift\/" target="_blank" rel="noopener noreferrer"[^>]*>Nightshift Design System<\/a>/,
	)
})
