// how the stream reader ends a chat turn: a drained stream completed unless the server wrote the failure marker
import { expect, test } from "bun:test"
import { CHAT_STREAM_FAILED_TEXT } from "@shared/contracts"
import { sendChatTurn } from "./chatClient"

// a mock stream response built from the given chunks
function toStreamResponse(chunks: string[]): Response {
	const encoder = new TextEncoder()

	// enqueue every chunk, then close like a finished reply
	const body = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk))
			}
			controller.close()
		},
	})

	// the reply arrives as an ok streaming response
	return new Response(body, { status: 200 })
}

// run one chat turn against a mocked fetch, returning its result and what streamed through
async function runChatTurn(chunks: string[]): Promise<{ sendResult: unknown; streamedText: string }> {
	// stand in for the network, restoring the real fetch after
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async () => toStreamResponse(chunks)) as unknown as typeof fetch

	// collect what onChunk saw beside what the call returned
	try {
		let streamedText = ""
		const sendResult = await sendChatTurn({ topicId: "t1" }, "a question", [], [], (chunk) => {
			streamedText += chunk
		})

		// hand both back for the assertions
		return { sendResult, streamedText }
	} finally {
		globalThis.fetch = originalFetch
	}
}

// a clean stream is a completed chat turn
test("sendChatTurn completes on a drained stream", async () => {
	const { sendResult, streamedText } = await runChatTurn(["Hello ", "there."])
	expect(sendResult).toBeNull()
	expect(streamedText).toBe("Hello there.")
})

// the failure marker turns the drained stream into a failed chat turn, and never reaches the bubble
test("sendChatTurn reads the failure marker as a failed chat turn", async () => {
	const { sendResult, streamedText } = await runChatTurn(["Half an ans", CHAT_STREAM_FAILED_TEXT])
	expect(sendResult).toBe("failed")
	expect(streamedText).toBe("Half an ans")
})

// a failure note split across chunks still reads as failed, with no fragment of it streamed
test("sendChatTurn holds back a failure note split across chunks", async () => {
	const splitAt = Math.floor(CHAT_STREAM_FAILED_TEXT.length / 2)
	const { sendResult, streamedText } = await runChatTurn([
		`Half an ans${CHAT_STREAM_FAILED_TEXT.slice(0, splitAt)}`,
		CHAT_STREAM_FAILED_TEXT.slice(splitAt),
	])
	expect(sendResult).toBe("failed")
	expect(streamedText).toBe("Half an ans")
})
