import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// restore transport after each account read
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("a failed account read is retryable and later refresh failures retain the complete budget", async () => {
	configureApiClient({ apiBaseUrl: "https://account.test", showError: () => {} })
	let isFailing = true
	globalThis.fetch = (async () => {
		if (isFailing) {
			throw new Error("offline")
		}
		return Response.json({ plan: "free", topics: [], subscriptions: [], invites: [] })
	}) as unknown as typeof fetch
	const harness = await renderTestHook(() => useAccount({ userId: "reader" }))
	try {
		await waitForHook(() => harness.read().isError)
		expect(harness.read().data).toBeUndefined()
		isFailing = false
		await act(async () => {
			await harness.read().refetch()
		})
		await waitForHook(() => harness.read().isSuccess)
		const loaded = harness.read().data
		expect(loaded?.billing).toBeDefined()
		expect(loaded?.activity).toBeDefined()
		isFailing = true
		await act(async () => {
			await harness.read().refetch()
		})
		await waitForHook(() => harness.read().isError)
		expect(harness.read().data).toBe(loaded)
	} finally {
		await harness.close()
	}
})
