import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { NoteBadge } from "@carlnotes/contracts/notes"
import { recordNoteRead, useNoteBadges, useNoteRead } from "@carlnotes/core/hooks/useNoteBadges"
import { resetNoteBadges, setNoteBadges, toAllNoteCount } from "@carlnotes/core/stores/noteBadgeStore"
import { focusManager, onlineManager } from "@tanstack/react-query"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// replace transport only; account fencing, suppression and lifecycle subscriptions remain real
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
const BADGE: NoteBadge = {
	noteId: "note-1",
	topicId: "topic-1",
	teamId: null,
	teamIds: [],
	noteName: "Notes",
	pageName: "Coffee",
	unreadEdits: 1,
	unreadComments: 2,
}
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	mock.restore()
	globalThis.fetch = originalFetch
	resetNoteBadges(null)
	focusManager.setFocused(true)
	onlineManager.setOnline(true)
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("initial, foreground and reconnect polls retain confirmed counts on failure and reset on account change", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	let account = "one"
	let calls = 0
	let isFailing = false
	globalThis.fetch = (async () => {
		calls++
		return isFailing ? Response.json({}, { status: 503 }) : Response.json({ badges: [BADGE] })
	}) as unknown as typeof fetch
	const harness = await renderTestHook(() => useNoteBadges(account))
	cleanups.push(harness.close)
	await waitForHook(() => toAllNoteCount() === 3)
	isFailing = true
	await act(async () => {
		focusManager.setFocused(false)
		focusManager.setFocused(true)
	})
	await waitForHook(() => calls === 2)
	expect(toAllNoteCount()).toBe(3)
	await act(async () => {
		onlineManager.setOnline(false)
		onlineManager.setOnline(true)
	})
	await waitForHook(() => calls === 3)
	expect(toAllNoteCount()).toBe(3)
	account = "two"
	await harness.render()
	expect(toAllNoteCount()).toBe(0)
})

test("failed read acknowledgement rolls suppression back and failed opens send no read", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	resetNoteBadges("one")
	setNoteBadges([BADGE])
	let calls = 0
	globalThis.fetch = (async () => {
		calls++
		return Response.json({}, { status: 503 })
	}) as unknown as typeof fetch
	const harness = await renderTestHook(() => useNoteRead(null, "one"))
	cleanups.push(harness.close)
	expect(calls).toBe(0)
	expect(await recordNoteRead("note-1", "one")).toBe(false)
	expect(toAllNoteCount()).toBe(3)
})

test("acknowledged reading releases suppression so edits arriving during refetch remain visible", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	resetNoteBadges("one")
	setNoteBadges([BADGE])
	let calls = 0
	globalThis.fetch = (async () =>
		++calls === 1
			? Response.json({})
			: Response.json({ badges: [{ ...BADGE, unreadComments: 4 }] })) as unknown as typeof fetch
	expect(await recordNoteRead("note-1", "one")).toBe(true)
	expect(toAllNoteCount()).toBe(5)
})

test("an old account's late read and badge response cannot populate the replacement account", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	resetNoteBadges("one")
	setNoteBadges([BADGE])
	let resolveRead: (response: Response) => void = () => {}
	let calls = 0
	globalThis.fetch = (() => {
		calls++
		return new Promise<Response>((resolve) => {
			resolveRead = resolve
		})
	}) as unknown as typeof fetch
	const reading = recordNoteRead("note-1", "one")
	resetNoteBadges("two")
	resolveRead(Response.json({}))
	await reading
	expect(calls).toBe(1)
	expect(toAllNoteCount()).toBe(0)
})

test("counts refresh every 45 seconds and unsubscribe after unmount", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	let calls = 0
	let refresh: (() => void) | undefined
	let timer: ReturnType<typeof setInterval> | undefined
	const setIntervalOriginal = globalThis.setInterval
	const interval = spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, delay?: number) => {
		refresh = callback as () => void
		timer = setIntervalOriginal(callback, delay)
		return timer
	}) as typeof setInterval)
	const clear = spyOn(globalThis, "clearInterval")
	globalThis.fetch = (async () => {
		calls += 1
		return Response.json({ badges: [BADGE] })
	}) as unknown as typeof fetch
	const harness = await renderTestHook(() => useNoteBadges("one"))
	await waitForHook(() => calls === 1)
	expect(interval.mock.calls[0]?.[1]).toBe(45_000)
	await act(async () => {
		refresh?.()
	})
	expect(calls).toBe(2)
	await harness.close()
	expect(clear).toHaveBeenCalledWith(timer)
	await act(async () => {
		refresh?.()
		focusManager.setFocused(false)
		focusManager.setFocused(true)
		onlineManager.setOnline(false)
		onlineManager.setOnline(true)
	})
	expect(calls).toBe(2)
})
