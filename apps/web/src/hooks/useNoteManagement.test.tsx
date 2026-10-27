import { afterEach, expect, test } from "bun:test"
import { toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import { useNoteManagement } from "@carlnotes/core/hooks/useNoteManagement"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// restore transport after exercising both clients' shared metadata controller
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test("rename serializes submissions and keeps the last accepted name as its baseline", async () => {
	const response = Promise.withResolvers<Response>()
	let requests = 0
	globalThis.fetch = Object.assign(
		async () => {
			requests += 1
			return response.promise
		},
		{ preconnect: originalFetch.preconnect },
	)
	const changes: unknown[] = []
	const harness = await renderTestHook(() =>
		useNoteManagement({
			note: toTestNote(),
			onChanged: (change) => changes.push(change),
			onDeleted: () => {},
			onError: () => {},
		}),
	)
	try {
		await act(async () => harness.read().setName("New name"))
		await act(async () => {
			const first = harness.read().rename()
			await harness.read().rename()
			expect(requests).toBe(1)
			response.resolve(new Response(null, { status: 204 }))
			await first
		})
		await act(async () => harness.read().setName(" "))
		await act(async () => harness.read().rename())
		expect(harness.read().name).toBe("New name")
		expect(changes).toEqual([{ name: "New name" }])
	} finally {
		await harness.close()
	}
})

test("failed metadata writes preserve editing context and never close the note", async () => {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("offline")
		},
		{ preconnect: originalFetch.preconnect },
	)
	const errors: string[] = []
	let closes = 0
	const harness = await renderTestHook(() =>
		useNoteManagement({
			note: toTestNote(),
			onChanged: () => {},
			onDeleted: () => {
				closes += 1
			},
			onError: (error) => errors.push(error),
		}),
	)
	try {
		await act(async () => harness.read().setName("Retain this"))
		await act(async () => harness.read().rename())
		await act(async () => harness.read().changeVisibility("public"))
		await act(async () => harness.read().remove())
		expect(harness.read().name).toBe("Retain this")
		expect(harness.read().visibility).toBe("private")
		expect(harness.read().isPending).toBe(false)
		expect(errors).toHaveLength(3)
		expect(closes).toBe(0)
	} finally {
		await harness.close()
	}
})

test("read-only and offline notes cannot dispatch metadata writes", async () => {
	let requests = 0
	globalThis.fetch = Object.assign(
		async () => {
			requests += 1
			return new Response(null, { status: 204 })
		},
		{ preconnect: originalFetch.preconnect },
	)
	for (const options of [
		{ note: toTestNote({ canEdit: false, canDelete: false, isNoteOwner: false }), isOffline: false },
		{ note: toTestNote(), isOffline: true },
	]) {
		const harness = await renderTestHook(() =>
			useNoteManagement({ ...options, onChanged: () => {}, onDeleted: () => {}, onError: () => {} }),
		)
		try {
			await act(async () => harness.read().setName("Blocked"))
			await act(async () => {
				await harness.read().rename()
				await harness.read().changeVisibility("public")
				await harness.read().remove()
			})
		} finally {
			await harness.close()
		}
	}
	expect(requests).toBe(0)
})
