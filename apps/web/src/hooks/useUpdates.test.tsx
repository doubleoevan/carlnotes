// one open reads one list: a remount keeps it, a failure waits for a retry, and a new open requests another
import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { Updates } from "@carlnotes/contracts/updates"
import { useTopicUpdates, useUpdates } from "@carlnotes/core/hooks/useUpdates"
import { UPDATES_STORY } from "@carlnotes/core/lib/updatesStories"
import type { UseQueryResult } from "@tanstack/react-query"
import { act, useState } from "react"
import { type HookTestHarness, renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// release every environment even after a failed assertion
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	updatesQuery = null
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: console.error })
})

// the list as the page reads it, and whether the page is open
let updatesQuery: UseQueryResult<Updates> | null = null
function UpdatesTestPage() {
	updatesQuery = useUpdates({ userId: "user-1", minutes: 15 })
	return null
}

// the card's side of an open: mounting the list page, and forgetting a length's list
function useUpdatesOpen() {
	const [isPageOpen, setIsPageOpen] = useState(true)
	return { isPageOpen, setIsPageOpen, refreshUpdates: useTopicUpdates() }
}

// stubs the api with the given responses in turn, and returns the bodies it received
function stubUpdatesFetch(toResponse: (requestCount: number) => Response): unknown[] {
	const requestBodies: unknown[] = []
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		requestBodies.push(JSON.parse(String(init?.body)))
		return toResponse(requestBodies.length)
	}) as typeof fetch
	return requestBodies
}

// mounts the list page and closes it after the test
async function mountUpdatesPage(): Promise<HookTestHarness<ReturnType<typeof useUpdatesOpen>>> {
	const harness = await renderTestHook(useUpdatesOpen, ({ isPageOpen }) => (isPageOpen ? <UpdatesTestPage /> : null))
	cleanups.push(harness.close)
	return harness
}

test("a remount keeps the list it has, and a new open requests another", async () => {
	const requestBodies = stubUpdatesFetch(() => Response.json(UPDATES_STORY))
	const harness = await mountUpdatesPage()
	await waitForHook(() => updatesQuery?.isSuccess === true)
	expect(requestBodies).toEqual([{ minutes: 15 }])

	// a remount of the page, as a back navigation does, reads no second list
	await act(async () => harness.read().setIsPageOpen(false))
	await act(async () => harness.read().setIsPageOpen(true))
	expect(updatesQuery?.data).toEqual(UPDATES_STORY)
	expect(requestBodies).toHaveLength(1)

	// choosing the length on screen reads a new list at once
	await act(async () => harness.read().refreshUpdates(15))
	await waitForHook(() => requestBodies.length === 2)

	// choosing another length leaves this list alone
	await act(async () => harness.read().refreshUpdates(30))
	expect(requestBodies).toHaveLength(2)

	// a length forgotten while its page is closed reads a new list when the page opens
	await waitForHook(() => updatesQuery?.isSuccess === true)
	await act(async () => harness.read().setIsPageOpen(false))
	await act(async () => harness.read().refreshUpdates(15))
	await act(async () => harness.read().setIsPageOpen(true))
	await waitForHook(() => requestBodies.length === 3)
})

test("a failed list shows its error until a retry, which reads the list", async () => {
	const requestBodies = stubUpdatesFetch((requestCount) =>
		requestCount === 1 ? new Response(null, { status: 500 }) : Response.json(UPDATES_STORY),
	)
	await mountUpdatesPage()
	await waitForHook(() => updatesQuery?.isError === true)
	expect(requestBodies).toHaveLength(1)

	// the retry the error state offers
	await act(async () => {
		await updatesQuery?.refetch()
	})
	await waitForHook(() => updatesQuery?.isSuccess === true)
	expect(requestBodies).toHaveLength(2)
})
