import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { configureApiClient } from "./apiClient"
import { stubFailingFetch, stubFetch } from "./fetchTestFixtures"
import { fetchTopicPage } from "./topicClient"
import {
	sendFindingFeedback,
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
} from "./topicFindingClient"

// isolate request and error presentation from the other client tests
const originalFetch = globalThis.fetch
const messages: string[] = []
const errorLog = spyOn(console, "error").mockImplementation(() => undefined)
afterAll(() => errorLog.mockRestore())
beforeEach(() => {
	messages.length = 0
	configureApiClient({ apiBaseUrl: "https://test.example", showError: (message) => messages.push(message) })
})
afterEach(() => {
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: console.error })
})

// all four writes share rejection behavior, while open stays quiet
const findingWrites = [
	{
		name: "bookmark",
		send: (shouldThrowOnError: boolean) =>
			sendTopicFindingBookmark({ findingId: "finding", isBookmarked: true, shouldThrowOnError }),
	},
	{
		name: "consume",
		send: (shouldThrowOnError: boolean) =>
			sendTopicFindingConsumed({ findingId: "finding", isConsumed: true, shouldThrowOnError }),
	},
	{
		name: "rating",
		send: (shouldThrowOnError: boolean) =>
			sendTopicFindingRating({ findingId: "finding", rating: null, shouldThrowOnError }),
	},
	{
		name: "open",
		send: (shouldThrowOnError: boolean) => sendTopicFindingOpened({ findingId: "finding", shouldThrowOnError }),
	},
]
for (const write of findingWrites) {
	test(`${write.name} preserves success and default failure behavior with opt-in rejection`, async () => {
		// successful writes settle with either error policy
		stubFetch(new Response(null, { status: 204 }))
		await expect(write.send(true)).resolves.toBeUndefined()
		expect(messages).toEqual([])

		// callers opt into throwing after the existing message has been shown
		stubFetch(new Response("rejected", { status: 403 }))
		await expect(write.send(true)).rejects.toThrow()
		expect(messages).toEqual(write.name === "open" ? [] : ["That didn't save. Carl suggests trying again."])
		stubFetch(new Response("rejected", { status: 500 }))
		await expect(write.send(false)).resolves.toBeUndefined()

		// network failure follows the same opt-in policy
		stubFailingFetch()
		await expect(write.send(true)).rejects.toThrow("network down")
		await expect(write.send(false)).resolves.toBeUndefined()
		if (write.name === "open") {
			expect(messages).toEqual([])
		}
	})
}

test("a Topic server error is not an access gate or a missing page", async () => {
	stubFetch(new Response("unavailable", { status: 503 }))
	await expect(fetchTopicPage("topic")).rejects.toThrow("503")
	stubFetch(new Response("missing", { status: 404 }))
	expect(await fetchTopicPage("topic")).toEqual({ status: "missing" })
})

test("feedback rejects failed saves so the details sheet keeps the user's words", async () => {
	// opt-in rejection distinguishes a saved note from a rejected or offline request
	const feedback = { findingId: "finding", feedback: "Helpful explanation", shouldThrowOnError: true }
	stubFetch(new Response(null, { status: 204 }))
	await expect(sendFindingFeedback(feedback)).resolves.toBeUndefined()
	stubFetch(new Response("rejected", { status: 403 }))
	await expect(sendFindingFeedback(feedback)).rejects.toThrow()
	stubFailingFetch()
	await expect(sendFindingFeedback(feedback)).rejects.toThrow("network down")
	expect(messages).toEqual([])
})
