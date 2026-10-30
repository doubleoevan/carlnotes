import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// the two bodies the account read joins, each as its contract parses it
const BILLING_STATE_RESPONSE = {
	plan: "free",
	billingInterval: "monthly",
	status: null,
	hasPaymentMethod: false,
	dailyScansUsed: 0,
	dailyScanLimit: 5,
}
const ACTIVITY_RESPONSE = {
	user: { userId: "reader", username: "reader", avatarSource: "generated", avatarVersion: null },
	scanSpendCents: 0,
	chatSpendCents: 0,
	podcastEpisodeSpendCents: 0,
	budgetCents: 300,
	monthlyBudgetCutoffs: [],
	topics: [],
	subscriptions: [],
	invites: [],
}

// restore transport after each account read
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("a failed account read is retryable and later refresh failures retain the complete budget", async () => {
	configureApiClient({ apiBaseUrl: "https://account.test", showError: () => {} })
	let isFailing = true
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		if (isFailing) {
			throw new Error("offline")
		}
		return Response.json(String(input).includes("/billing/") ? BILLING_STATE_RESPONSE : ACTIVITY_RESPONSE)
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
