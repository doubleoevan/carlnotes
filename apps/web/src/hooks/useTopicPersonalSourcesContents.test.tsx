import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as personalSourcesClient from "@carlnotes/client/personalSourcesClient"
import { useTopicPersonalSourcesContents } from "@carlnotes/core/hooks/useTopicPersonalSourcesContents"
import {
	PERSONAL_SOURCES_ENTRIES_STORY,
	TOPIC_PERSONAL_SOURCES_STORY,
} from "@carlnotes/core/lib/personalSourcesStories"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

beforeEach(() => {
	spyOn(personalSourcesClient, "fetchTopicPersonalSources").mockResolvedValue(TOPIC_PERSONAL_SOURCES_STORY)
})
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	mock.restore()
})

test("Topic-wide paging releases previous decrypted pages without fetching scoring context", async () => {
	const entry = PERSONAL_SOURCES_ENTRIES_STORY[0]
	if (!entry) {
		throw new Error("Missing fixture")
	}
	const entries = Array.from({ length: 11 }, (_, index) => ({
		...entry,
		id: `entry-${index}`,
		text: `Private entry ${index}.`,
	}))
	const read = spyOn(personalSourcesClient, "fetchTopicPersonalSourcesEntries").mockImplementation(
		async ({ pageNumber = 1 }) => ({
			entries: entries.slice((pageNumber - 1) * 5, pageNumber * 5),
			nextCursor: null,
			pagination: { pageNumber, pageCount: 3, entryOffset: (pageNumber - 1) * 5, totalEntryCount: 11 },
		}),
	)
	const harness = await renderTestHook(() => useTopicPersonalSourcesContents({ userId: "owner", topicId: "topic" }))
	cleanups.push(harness.close)
	await waitForHook(() => !harness.read().isLoading)
	expect(harness.read().page?.entries[0]?.text).toBe(entries[0]?.text)
	expect(harness.client.getQueryCache().findAll({ queryKey: ["topic-personal-sources-context"] })).toHaveLength(0)
	expect(harness.read().entryOffset).toBe(0)
	await act(async () => harness.read().openPage(3))
	await waitForHook(() => harness.read().pageNumber === 3 && !harness.read().isLoading)
	expect(read).toHaveBeenLastCalledWith({ topicId: "topic", pageNumber: 3, signal: expect.any(AbortSignal) })
	expect(harness.read().entryOffset).toBe(10)
	expect(read).toHaveBeenCalledTimes(2)
	expect(harness.read().page?.entries).toHaveLength(1)
	await waitForHook(
		() => harness.client.getQueryCache().findAll({ queryKey: ["topic-personalSources-entries"] }).length === 1,
	)
	expect(
		JSON.stringify(
			harness.client
				.getQueryCache()
				.findAll({ queryKey: ["topic-personalSources-entries"] })
				.map((query) => query.state.data),
		),
	).not.toContain(entries[0]?.text ?? "Missing fixture")
	await act(async () => harness.read().openPage(1))
	await waitForHook(() => harness.read().pageNumber === 1 && !harness.read().isLoading)
	expect(harness.read().entryOffset).toBe(0)
})

test("failed deletion preserves text; confirmed deletion refreshes entries", async () => {
	const entry = PERSONAL_SOURCES_ENTRIES_STORY[0]
	if (!entry) {
		throw new Error("Missing fixture")
	}
	const read = spyOn(personalSourcesClient, "fetchTopicPersonalSourcesEntries").mockResolvedValue({
		entries: [entry],
		nextCursor: null,
	})
	const remove = spyOn(personalSourcesClient, "sendDeletePersonalSourceEntry").mockRejectedValue(new Error("Offline"))
	const harness = await renderTestHook(() => useTopicPersonalSourcesContents({ userId: "owner", topicId: "topic" }))
	cleanups.push(harness.close)
	await waitForHook(() => !harness.read().isLoading)
	await act(async () => harness.read().removeEntry(entry))
	expect(remove).not.toHaveBeenCalled()
	await act(async () => harness.read().confirm())
	expect(harness.read().page?.entries).toEqual([entry])
	expect(harness.read().error).toContain("Try again")
	remove.mockResolvedValue(undefined)
	read.mockResolvedValue({ entries: [], nextCursor: null })
	await act(async () => harness.read().confirm())
	await waitForHook(() => harness.read().page?.entries.length === 0)
	expect(harness.read().confirmation).toBeNull()
	expect(remove).toHaveBeenLastCalledWith({ topicId: "topic", entryId: entry.id })
})

// both containing surfaces can stay mounted on independent numbered pages
test("deleting from one placement refreshes the other placement's current page", async () => {
	const entry = PERSONAL_SOURCES_ENTRIES_STORY[0]
	if (!entry) {
		throw new Error("Missing fixture")
	}
	let isDeleted = false
	spyOn(personalSourcesClient, "fetchTopicPersonalSourcesEntries").mockImplementation(async ({ pageNumber = 1 }) => ({
		entries: isDeleted ? [] : [entry],
		nextCursor: null,
		pagination: {
			pageNumber: isDeleted ? 1 : pageNumber,
			pageCount: isDeleted ? 1 : 2,
			entryOffset: isDeleted ? 0 : (pageNumber - 1) * 5,
			totalEntryCount: isDeleted ? 0 : 6,
		},
	}))
	spyOn(personalSourcesClient, "sendDeletePersonalSourceEntry").mockImplementation(async () => {
		isDeleted = true
	})
	const harness = await renderTestHook(() => ({
		info: useTopicPersonalSourcesContents({ userId: "owner", topicId: "topic" }),
		blend: useTopicPersonalSourcesContents({ userId: "owner", topicId: "topic" }),
	}))
	cleanups.push(harness.close)
	await waitForHook(() => !harness.read().info.isLoading && !harness.read().blend.isLoading)
	await act(async () => harness.read().blend.openPage(2))
	await waitForHook(() => harness.read().blend.pageNumber === 2 && !harness.read().blend.isLoading)
	await act(async () => harness.read().blend.removeEntry(entry))
	await act(async () => harness.read().blend.confirm())
	await waitForHook(
		() => harness.read().info.page?.entries.length === 0 && harness.read().blend.page?.entries.length === 0,
	)
	expect(harness.read().info.pageNumber).toBe(1)
	expect(harness.read().blend.pageNumber).toBe(1)
})
