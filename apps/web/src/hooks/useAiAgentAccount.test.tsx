import { afterEach, expect, spyOn, test } from "bun:test"
import * as aiAgentClient from "@carlnotes/client/aiAgentClient"
import { useAiAgentAccount } from "@carlnotes/core/hooks/useAiAgentAccount"
import { aiAgentAccountStory } from "@carlnotes/core/lib/aiAgentAccountStories"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// restore the DOM and client functions before another account test
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	mockRestore()
})
const spies: { mockRestore: () => void }[] = []
function mockRestore(): void {
	for (const spy of spies.splice(0)) {
		spy.mockRestore()
	}
}

test("API secrets are shown once, never cached, and hidden on explicit dismissal", async () => {
	// load metadata and create a synthetic key through the real hook
	const fixture = aiAgentAccountStory()
	spies.push(spyOn(aiAgentClient, "fetchConnectedAiAgents").mockResolvedValue({ aiAgents: fixture.aiAgents }))
	spies.push(spyOn(aiAgentClient, "fetchAiAgentApiKeys").mockResolvedValue({ keys: fixture.keys, canCreate: true }))
	const key = fixture.keys[0]
	if (!key) {
		throw new Error("missing fixture key")
	}
	spies.push(spyOn(aiAgentClient, "sendCreateAiAgentApiKey").mockResolvedValue({ key, secret: "private-test-canary" }))
	const harness = await renderTestHook(() => useAiAgentAccount("owner"))
	cleanups.push(harness.close)
	await waitForHook(() => !harness.read().isLoading)
	await act(async () => harness.read().createKey("My agent"))

	// the query cache contains metadata only and dismissal releases the display copy
	expect(harness.read().secret).toBe("private-test-canary")
	expect(
		JSON.stringify(
			harness.client
				.getQueryCache()
				.getAll()
				.map((query) => query.state.data),
		),
	).not.toContain("private-test-canary")
	await act(async () => harness.read().dismissSecret())
	expect(harness.read().secret).toBeNull()
})

test("concurrent key presses share one mutation and an unmounted response is discarded", async () => {
	// keep creation in flight while a repeated press and account unmount occur
	spies.push(spyOn(aiAgentClient, "fetchConnectedAiAgents").mockResolvedValue({ aiAgents: [] }))
	spies.push(spyOn(aiAgentClient, "fetchAiAgentApiKeys").mockResolvedValue({ keys: [], canCreate: true }))
	const pending = Promise.withResolvers<Awaited<ReturnType<typeof aiAgentClient.sendCreateAiAgentApiKey>>>()
	const create = spyOn(aiAgentClient, "sendCreateAiAgentApiKey").mockReturnValue(pending.promise)
	spies.push(create)
	const harness = await renderTestHook(() => useAiAgentAccount("owner"))
	await waitForHook(() => !harness.read().isLoading)
	let creation: Promise<void> | undefined
	await act(async () => {
		creation = harness.read().createKey("My agent")
		void harness.read().createKey("My agent")
	})
	expect(create).toHaveBeenCalledTimes(1)
	await harness.close()

	// resolving after unmount cannot populate a new account's state or cache
	const key = aiAgentAccountStory().keys[0]
	if (!key) {
		throw new Error("missing fixture key")
	}
	pending.resolve({ key, secret: "late-private-canary" })
	await creation
	expect(harness.read().secret).toBeNull()
	expect(harness.client.getQueryCache().getAll()).toHaveLength(0)
})
