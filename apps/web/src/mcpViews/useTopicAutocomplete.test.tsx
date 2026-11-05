import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"
import * as host from "./mcpViewHost"
import { TOPIC_SUGGESTIONS_INPUT as input, TOPIC_SUGGESTIONS_FIXTURE as suggestions } from "./topicSuggestionsFixtures"
import { useTopicAutocomplete } from "./useTopicAutocomplete"

afterEach(() => mock.restore())

test("autocomplete debounces names through the host and does not call the matching or send actions", async () => {
	const call = spyOn(host, "callMcpViewTool").mockResolvedValue({ content: [], structuredContent: suggestions })
	const hook = await renderTestHook(() => useTopicAutocomplete({ input, query: "a", isEnabled: true }))
	try {
		// replacing text before the delay cancels its request
		await hook.render(() => useTopicAutocomplete({ input, query: " agent ", isEnabled: true }))
		expect(call).not.toHaveBeenCalled()
		await waitForHook(() => !hook.read().isLoading)
		expect(call.mock.calls).toEqual([
			["suggest_topics", { ...input, query: "agent", cursor: undefined, autocomplete: true }],
		])
		expect(hook.read().topics).toEqual(suggestions.editableTopics)
	} finally {
		await hook.close()
	}
})

test("an older autocomplete response cannot replace names for the current query", async () => {
	let resolveFirst: (response: { content: []; structuredContent: typeof suggestions }) => void = () => {}
	const call = spyOn(host, "callMcpViewTool")
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveFirst = resolve
				}),
		)
		.mockResolvedValue({ content: [], structuredContent: { ...suggestions, editableTopics: [] } })
	const hook = await renderTestHook(() => useTopicAutocomplete({ input, query: "first", isEnabled: true }))
	try {
		await waitForHook(() => call.mock.calls.length === 1)
		await hook.render(() => useTopicAutocomplete({ input, query: "second", isEnabled: true }))
		await waitForHook(() => !hook.read().isLoading)
		await act(async () => resolveFirst({ content: [], structuredContent: suggestions }))
		expect(hook.read().topics).toEqual([])
	} finally {
		await hook.close()
	}
})
