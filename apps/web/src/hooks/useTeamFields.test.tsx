import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { useTeamFields } from "@carlnotes/core/hooks/useTeamFields"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// isolate each form and its transport from the next test
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("a late taken-name response cannot reject a corrected team name", async () => {
	// hold the first reply while the reader corrects the name
	configureApiClient({ apiBaseUrl: "https://teams.test", showError: () => {} })
	const response = Promise.withResolvers<Response>()
	globalThis.fetch = (() => response.promise) as unknown as typeof fetch
	const harness = await renderTestHook(() => useTeamFields({}))
	cleanups.push(harness.close)
	await act(async () => harness.read().setName("Taken name"))
	const check = harness.read().checkName()
	await act(async () => harness.read().setName("Corrected name"))
	await act(async () => {
		response.resolve(Response.json({ isTaken: true }))
		await check
	})
	expect(harness.read().nameRejection).toBeNull()
	expect(harness.read().savedFields.name).toBe("Corrected name")
})

test("name checks clear after editing and skip the team's already saved name", async () => {
	// show the current rejection, then allow a corrected or already owned name
	configureApiClient({ apiBaseUrl: "https://teams.test", showError: () => {} })
	let requestCount = 0
	globalThis.fetch = (async () => {
		requestCount += 1
		return Response.json({ isTaken: true })
	}) as unknown as typeof fetch
	const harness = await renderTestHook(() => useTeamFields({}))
	cleanups.push(harness.close)
	await act(async () => harness.read().setName("Taken name"))
	await act(async () => harness.read().checkName())
	expect(harness.read().nameRejection).not.toBeNull()
	await act(async () => harness.read().setName(" My Team "))
	expect(harness.read().nameRejection).toBeNull()
	await act(async () => harness.read().checkName("my team"))
	expect(requestCount).toBe(1)
	expect(harness.read().nameRejection).toBeNull()
})

test("a failed advisory name lookup keeps the form available for saving", async () => {
	// leave final name validation to the save endpoint when the lookup fails
	configureApiClient({ apiBaseUrl: "https://teams.test", showError: () => {} })
	globalThis.fetch = (async () => {
		throw new Error("offline")
	}) as unknown as typeof fetch
	const harness = await renderTestHook(() => useTeamFields({}))
	cleanups.push(harness.close)
	await act(async () => harness.read().setName("Available name"))
	await act(async () => harness.read().checkName())
	expect(harness.read().nameRejection).toBeNull()
	expect(harness.read().savedFields.name).toBe("Available name")
})
