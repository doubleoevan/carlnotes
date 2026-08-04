// unsubscribe page tests: the confirmation page names the topic and escapes it, and the invalid page renders a fallback
import { expect, test } from "bun:test"
import { invalidUnsubscribePage, unsubscribedPage } from "./unsubscribe"

// the confirmation page states the outcome, names the topic, escapes html-significant characters, and links to the topic
test("unsubscribedPage names the topic and links to it", () => {
	const page = unsubscribedPage({ id: "t1", name: "A & B <topic>" }, "https://carlnotes.example.com")
	expect(page).toContain("You're unsubscribed")
	expect(page).toContain("Carl will read quietly")
	expect(page).toContain("A &amp; B &lt;topic&gt;")
	expect(page).toContain("Drop by on your own for the latest notes")
	expect(page).toContain("https://carlnotes.example.com/topics/t1")
})

// a missing or forged token lands on a fallback page instead of an error
test("invalidUnsubscribePage renders a fallback message", () => {
	expect(invalidUnsubscribePage()).toContain("didn't work")
})
