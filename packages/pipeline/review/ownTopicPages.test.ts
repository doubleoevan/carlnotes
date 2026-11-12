// own topic page tests: a topic's page, its podcast episodes, and its Topic Posts match, and another topic's pages, the
// docs, the release notes, other sites, and a url that does not parse do not
import { expect, test } from "bun:test"
import { isOwnTopicPageUrl } from "./ownTopicPages"

const TOPIC_ID = "caaa8d85-621c-493c-bf43-434a55e84aac"

// the topic's page, its podcast episodes, and its Topic Posts are its own pages
test("a topic's own pages on CarlNotes are recognized", () => {
	expect(isOwnTopicPageUrl(`https://carlnotes.com/topics/${TOPIC_ID}`, TOPIC_ID)).toBe(true)
	expect(isOwnTopicPageUrl(`https://carlnotes.com/topics/${TOPIC_ID}/keeping-up-with-the-chens`, TOPIC_ID)).toBe(true)
	expect(
		isOwnTopicPageUrl(
			`https://www.carlnotes.com/topics/${TOPIC_ID}/keeping-up-with-the-chens/episodes/2026/19`,
			TOPIC_ID,
		),
	).toBe(true)
})

// another topic's pages, the docs, the release notes, and other sites are not
test("other pages are not the topic's own", () => {
	expect(isOwnTopicPageUrl("https://carlnotes.com/topics/787d0773-3e78-44f6-a6e6-3a98505f08f5", TOPIC_ID)).toBe(false)
	expect(isOwnTopicPageUrl(`https://carlnotes.com/topics/${TOPIC_ID}0`, TOPIC_ID)).toBe(false)
	expect(isOwnTopicPageUrl("https://carlnotes.com/docs/feed/coffee-break", TOPIC_ID)).toBe(false)
	expect(isOwnTopicPageUrl("https://carlnotes.com/releases", TOPIC_ID)).toBe(false)
	expect(isOwnTopicPageUrl(`https://example.com/topics/${TOPIC_ID}`, TOPIC_ID)).toBe(false)
	expect(isOwnTopicPageUrl("not a url", TOPIC_ID)).toBe(false)
})
