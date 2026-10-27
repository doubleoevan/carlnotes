import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { useTopicFields } from "@carlnotes/core/hooks/useTopicFields"
import { useTopicSourceEditor } from "@carlnotes/core/hooks/useTopicSourceEditor"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// isolate form state and transport between tests
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("adding a kept source again does not consume another source slot", async () => {
	// edit a Topic that already reads this RSS feed
	const value = "https://source.test/feed"
	const topic = toTestTopicResponse({
		sources: [{ id: "source-1", sourceKind: "rss", summary: "Source", value, status: "ready", error: null }],
	})
	const harness = await renderTestHook(() => useTopicSourceEditor(useTopicFields(topic), () => {}))
	cleanups.push(harness.close)
	const slotsBefore = harness.read().sourceSlotsLeft
	await act(async () => harness.read().setNewValue(` ${value} `))
	await act(async () => harness.read().handleAddSource())
	expect(harness.read().addedSources).toEqual([])
	expect(harness.read().sourceSlotsLeft).toBe(slotsBefore)
})

test("late recommendations preserve sources added while the request was pending", async () => {
	// hold recommendations while the reader adds one of the suggested Sources
	configureApiClient({ apiBaseUrl: "https://topics.test", showError: () => {} })
	const response = Promise.withResolvers<Response>()
	globalThis.fetch = (() => response.promise) as unknown as typeof fetch
	const harness = await renderTestHook(() => useTopicSourceEditor(useTopicFields(undefined), () => {}))
	cleanups.push(harness.close)
	let request: Promise<void> | undefined
	await act(async () => {
		request = harness.read().handleSuggestSources()
	})
	await act(async () => harness.read().setNewValue("https://source.test/feed"))
	await act(async () => harness.read().handleAddSource())

	// merge only the still-new recommendation into the committed form
	await act(async () => {
		response.resolve(
			Response.json({
				sources: [
					{ sourceOption: "rss", value: "https://source.test/feed" },
					{ sourceOption: "rss", value: "https://another.test/feed" },
				],
			}),
		)
		await request
	})
	expect(harness.read().addedSources.map((source) => source.value)).toEqual([
		"https://source.test/feed",
		"https://another.test/feed",
	])
})
