// the shared body image upload through the web's paste: a pasted image goes in by its stored url at the api's origin,
// at the caret the paste began at, and never by its blob url, a batch goes in together in its order, a failed upload
// inserts nothing and says why, and a closed editor aborts its upload

import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { type PickedBodyImage, useTopicPostBodyImageUpload } from "@carlnotes/core/hooks/useTopicPostBodyImageUpload"
import type { NoteEditorCommands } from "@carlnotes/core/lib/noteFormats"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// each test owns fetch and its mounted React environment
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

// the stored url an upload returns, and the blob url a paste names
const STORED_URL = "/api/topic-post-body-images/a/b/column.webp"
const PASTED_IMAGE: PickedBodyImage = { uri: "blob:http://localhost/pasted", type: "image/png" }

// an editor that records each command the upload sends it
function toRecordingEditor(commands: string[]): NoteEditorCommands {
	const editor: Pick<NoteEditorCommands, "setSelection" | "setImage"> = {
		setSelection: (start, end) => {
			commands.push(`select ${start}-${end}`)
		},
		setImage: (src, width, height) => {
			commands.push(`image ${src} ${width}x${height}`)
		},
	}
	return editor as NoteEditorCommands
}

// mount the upload with the api answering every request with the given response
async function mountBodyImageUpload(response: Response) {
	// the api's answer and the editor's commands
	configureApiClient({ apiBaseUrl: "http://localhost", showError: () => {} })
	globalThis.fetch = (async () => response) as unknown as typeof fetch
	const commands: string[] = []
	const errors: string[] = []
	const editorRef = { current: toRecordingEditor(commands) }

	// the hook with the caret at 7
	const harness = await renderTestHook(() =>
		useTopicPostBodyImageUpload({
			topicPostId: "post-1",
			editorRef,
			selection: { start: 7, end: 7, text: "" },
			appendImage: async (body) => body.append("image", new Blob([new Uint8Array([1])], { type: "image/png" })),
			onError: (message) => errors.push(message),
		}),
	)
	cleanups.push(harness.close)
	return { harness, commands, errors }
}

test("a pasted image goes in by its stored url at the paste's caret, never by its blob url", async () => {
	const { harness, commands } = await mountBodyImageUpload(Response.json({ url: STORED_URL, width: 640, height: 480 }))

	// the paste shows its preview until the upload lands
	await act(async () => harness.read().uploadImages([PASTED_IMAGE]))
	await waitForHook(() => harness.read().previewUris.length === 0)
	expect(commands).toEqual(["select 7-7", `image http://localhost${STORED_URL} 640x480`])
	expect(commands.some((command) => command.includes("blob:"))).toBe(false)
})

test("a batch goes in together at the caret the paste began at, each image after the one before", async () => {
	const { harness, commands } = await mountBodyImageUpload(Response.json({}))

	// the api returns each image's own stored url in turn
	let uploadCount = 0
	globalThis.fetch = (async () => {
		uploadCount += 1
		return Response.json({ url: `/api/topic-post-body-images/a/${uploadCount}/column.webp`, width: 4, height: 3 })
	}) as unknown as typeof fetch

	// two pasted images go up, then both go in at the caret
	const secondImage = { ...PASTED_IMAGE, uri: "blob:http://localhost/second" }
	await act(async () => harness.read().uploadImages([PASTED_IMAGE, secondImage]))
	await waitForHook(() => commands.length === 3)
	expect(commands).toEqual([
		"select 7-7",
		"image http://localhost/api/topic-post-body-images/a/1/column.webp 4x3",
		"image http://localhost/api/topic-post-body-images/a/2/column.webp 4x3",
	])
})

test("a rejected upload inserts nothing and says why", async () => {
	const { harness, commands, errors } = await mountBodyImageUpload(
		Response.json({ error: "image-limit-reached" }, { status: 422 }),
	)

	// the rejection clears the preview and inserts nothing
	await act(async () => harness.read().uploadImages([PASTED_IMAGE]))
	await waitForHook(() => harness.read().previewUris.length === 0)
	expect(commands).toEqual([])
	expect(errors).toEqual(["This post holds as many images as your plan allows."])
})

test("closing the editor aborts an upload on its way, inserts nothing, and says nothing", async () => {
	const { harness, commands, errors } = await mountBodyImageUpload(Response.json({}))

	// an api that answers only once the request is aborted
	let uploadSignal: AbortSignal | undefined
	globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
		uploadSignal = init?.signal ?? undefined
		return new Promise((_resolve, reject) =>
			uploadSignal?.addEventListener("abort", () => reject(uploadSignal?.reason)),
		)
	}) as unknown as typeof fetch

	// the upload starts, then the editor closes
	await act(async () => harness.read().uploadImages([PASTED_IMAGE]))
	await waitForHook(() => uploadSignal !== undefined)
	await harness.close()
	await Bun.sleep(0)
	expect(uploadSignal?.aborted).toBe(true)
	expect(commands).toEqual([])
	expect(errors).toEqual([])
})
