// render tests for a search row's image, which opens the row's page unless that page is the one open
import { expect, test } from "bun:test"
import type { SearchRow } from "@carlnotes/contracts/search"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { type LinkedSearchRow, SearchRowLine } from "./SearchRowParts"

// a topic's image files, and a topic's row with that image
const IMAGE_FILES = { url: "/images/chens.jpg", url2x: "/images/chens@2x.jpg" }
const TOPIC_PATH = "/topics/t1/chens"
const topicRow = {
	kind: "topic",
	id: "t1",
	name: "Chens",
	path: TOPIC_PATH,
	date: "2026-11-10T12:00:00.000Z",
	count: 3,
	topic: {
		id: "t1",
		name: "Chens",
		latestPodcastEpisode: null,
		image: { page: IMAGE_FILES, list: IMAGE_FILES, thumbnail: IMAGE_FILES },
	},
	subscriberCount: 1,
	isSubscribed: false,
} satisfies SearchRow as LinkedSearchRow

test("a row's image links to the row's page, out of the tab order and the accessibility tree", async () => {
	const rowHtml = await renderWithRouter(<SearchRowLine searchRow={topicRow} />)
	expect(rowHtml).toContain(`href="${TOPIC_PATH}"`)
	expect(rowHtml).toMatch(/<a[^>]*tabindex="-1"[^>]*aria-hidden="true"[^>]*>\s*<span role="img"/)
})

test("a row's image on the row's own page is a plain image", async () => {
	const rowHtml = await renderWithRouter(<SearchRowLine searchRow={topicRow} />, TOPIC_PATH)
	expect(rowHtml).toContain('aria-label="Image of Chens"')
	expect(rowHtml).not.toContain("<a ")
})
