import { afterEach, expect, test } from "bun:test"
import { toChatReplyLineText } from "@carlnotes/contracts/chat"
import { sendChatTurn } from "./chatClient"

// restore the configured fetch after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test("the configured fetch delivers split UTF-8 text and tool lines before EOF", async () => {
	// keep the response open while verifying that a complete line has already reached the UI
	let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
	globalThis.fetch = (async () =>
		new Response(
			new ReadableStream({
				start(responseController) {
					streamController = responseController
				},
			}),
		)) as unknown as typeof fetch
	let streamedAnswer = ""
	let hasReceivedToolCalls = false
	let hasFinished = false
	const sendChatTurnPromise = sendChatTurn({
		page: { topicId: "topic" },
		question: "hello",
		history: [],
		attachments: [],
		onChunk: (chunk) => {
			streamedAnswer += chunk
		},
		onToolCalls: () => {
			hasReceivedToolCalls = true
		},
	}).then((chatSendResult) => {
		hasFinished = true
		return chatSendResult
	})
	while (!streamController) {
		await new Promise((resolve) => setTimeout(resolve, 1))
	}
	// stream a split UTF-8 answer before completing the response
	const bytes = new TextEncoder().encode(toChatReplyLineText({ type: "text", text: "Coffee ☕ café" }))
	for (const byte of bytes) {
		streamController.enqueue(new Uint8Array([byte]))
	}
	await new Promise((resolve) => setTimeout(resolve, 5))
	expect(streamedAnswer).toBe("Coffee ☕ café")
	expect(hasFinished).toBe(false)
	// deliver tool calls and finish the response
	streamController.enqueue(
		new TextEncoder().encode(
			toChatReplyLineText({ type: "toolCalls", toolCalls: { topicSaves: ["saved"], topicSaveRejections: [] } }),
		),
	)
	streamController.close()
	expect(await sendChatTurnPromise).toBeNull()
	expect(hasReceivedToolCalls).toBe(true)
})

test("an aborted native fetch is stopped even when its error is not a DOMException", async () => {
	// simulate a native fetch that aborts with a TypeError
	const abortController = new AbortController()
	globalThis.fetch = (async () => {
		abortController.abort()
		throw new TypeError("cancelled by native transport")
	}) as unknown as typeof fetch
	expect(
		await sendChatTurn({
			page: { topicId: "topic" },
			question: "hello",
			history: [],
			attachments: [],
			signal: abortController.signal,
			onChunk: () => {},
		}),
	).toBe("stopped")
})
