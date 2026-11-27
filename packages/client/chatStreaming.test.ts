import { afterEach, expect, test } from "bun:test"
import { toChatReplyLineText } from "@carlnotes/contracts/chatTurns"
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

// a reply stream's body: the opening blank line, then one json line each
function toStreamBody(lines: unknown[]): string {
	return `\n${lines.map((line) => `${JSON.stringify(line)}\n`).join("")}`
}

// read a whole stream of the given lines through sendChatTurn, collecting its text and its tool calls
async function readChatStreamLines(
	lines: unknown[],
): Promise<{ text: string; toolCallCount: number; chatSendResult: unknown }> {
	globalThis.fetch = (async () => new Response(toStreamBody(lines))) as unknown as typeof fetch
	let text = ""
	let toolCallCount = 0
	const chatSendResult = await sendChatTurn({
		page: { newTopic: true },
		question: "hello",
		history: [],
		attachments: [],
		onChunk: (chunk) => {
			text += chunk
		},
		onToolCalls: () => {
			toolCallCount += 1
		},
	})
	return { text, toolCallCount, chatSendResult }
}

// the reader skips a line kind it does not know
test("a line of an unknown kind between two text lines is dropped", async () => {
	const readResult = await readChatStreamLines([
		{ type: "text", text: "How often " },
		{ type: "aKindNoReaderKnows", value: 1 },
		{ type: "text", text: "should I look?" },
	])
	expect(readResult).toEqual({ text: "How often should I look?", toolCallCount: 0, chatSendResult: null })
})

test("a failed line after an unknown kind still reads as failed", async () => {
	const readResult = await readChatStreamLines([
		{ type: "text", text: "Hi" },
		{ type: "aKindNoReaderKnows" },
		{ type: "failed" },
	])
	expect(readResult.chatSendResult).toBe("failed")
})

test("the saved line and a suggested reply reach their handlers before the stream closes", async () => {
	// the reply, its end, and its suggestion, read with both handlers
	const body = toStreamBody([
		{ type: "text", text: "How often should I look?" },
		{ type: "saved" },
		{ type: "suggestedReply", suggestedReply: "Weekly is fine" },
	])
	globalThis.fetch = (async () => new Response(body)) as unknown as typeof fetch
	const events: string[] = []
	const chatSendResult = await sendChatTurn({
		page: { newTopic: true },
		question: "espresso machines",
		history: [],
		attachments: [],
		onChunk: (chunk) => events.push(`text ${chunk}`),
		onSaved: () => events.push("saved"),
		onSuggestedReply: (suggestedReply) => events.push(`suggestion ${suggestedReply}`),
	})

	// each line in order, and the turn answered
	expect(events).toEqual(["text How often should I look?", "saved", "suggestion Weekly is fine"])
	expect(chatSendResult).toBeNull()
})

test("a malformed or unsafe suggested reply line is dropped", async () => {
	// a suggestion with no text, one that is not a string, and one holding an email, then the reply's end
	const body = toStreamBody([
		{ type: "suggestedReply" },
		{ type: "suggestedReply", suggestedReply: 4 },
		{ type: "suggestedReply", suggestedReply: "Invite sam@example.com" },
		{ type: "saved" },
	])
	globalThis.fetch = (async () => new Response(body)) as unknown as typeof fetch
	const suggestedReplies: string[] = []
	const chatSendResult = await sendChatTurn({
		page: { newTopic: true },
		question: "hi",
		history: [],
		attachments: [],
		onChunk: () => {},
		onSuggestedReply: (suggestedReply) => suggestedReplies.push(suggestedReply),
	})
	expect(suggestedReplies).toEqual([])
	expect(chatSendResult).toBeNull()
})
