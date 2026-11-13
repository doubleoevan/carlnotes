// the shared Topic Post save through the web's harness: a conflict saves the draft over the newer version once, and a
// failed retry leaves no draft counted as saved, even one edited back to the text before the conflict

import { afterEach, expect, test } from "bun:test"
import type { TopicPostSaveResult } from "@carlnotes/contracts/topicPosts"
import { useTopicPostSave } from "@carlnotes/core/hooks/useTopicPostSave"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// each test closes its mounted React environment
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
})

// the draft the editor opened on
const TOPIC_POST = { id: "post-1", title: "Pour over", html: "<p>Bloom first.</p>", version: 1, publishedAt: null }

test("a failed retry after a conflict leaves the text before the conflict unsaved", async () => {
	// the server returns a newer version, then fails the retry
	const saveResults: TopicPostSaveResult[] = [
		{ status: "conflict", version: 3 },
		{ status: "conflict", version: 4 },
	]
	const sentVersions: number[] = []
	const harness = await renderTestHook(() =>
		useTopicPostSave({
			topicPost: TOPIC_POST,
			onSaveError: () => {},
			saveTopicPostDraft: async (_topicPostId, { version }) => {
				sentVersions.push(version)
				return saveResults.shift() ?? { status: "saved", version: 5 }
			},
		}),
	)
	cleanups.push(harness.close)

	// an edit goes out, conflicts, and its retry at the newer version fails
	harness.read().scheduleHtml("<p>Bloom for thirty seconds.</p>")
	expect(await act(() => harness.read().saveNow())).toBe(false)
	expect(sentVersions).toEqual([1, 3])

	// the body edited back to the text before the conflict is still sent, at the version the conflict returned
	harness.read().scheduleHtml(TOPIC_POST.html)
	expect(await act(() => harness.read().saveNow())).toBe(true)
	expect(sentVersions).toEqual([1, 3, 3])
})
