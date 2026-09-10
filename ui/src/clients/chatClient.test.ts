// how the stream reader ends a chat turn: a drained stream completed unless the server wrote the failure marker
import { expect, test } from "bun:test"
import { CHAT_STREAM_FAILED_TEXT, CHAT_TOOL_CALLS_MARKER, type TopicToolCalls } from "@shared/contracts"
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

// run one chat turn against a mocked fetch, returning its result, what streamed through, and the tool calls
async function runChatTurn(
	chunks: string[],
): Promise<{ sendResult: unknown; streamedText: string; topicToolCalls: TopicToolCalls | null }> {
	// stand in for the network, restoring the real fetch after
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async () => toStreamResponse(chunks)) as unknown as typeof fetch

	// collect what onChunk and onToolCalls saw beside what the call returned
	try {
		let streamedText = ""
		let topicToolCalls: TopicToolCalls | null = null
		const sendResult = await sendChatTurn(
			{ topicId: "t1" },
			"a question",
			[],
			[],
			(chunk) => {
				streamedText += chunk
			},
			(toolCalls) => {
				topicToolCalls = toolCalls
			},
		)

		// hand all three back for the assertions
		return { sendResult, streamedText, topicToolCalls }
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

// the tool calls never reach the bubble, but they come back for the toast, the card, and the topic page
test("sendChatTurn strips the tool calls and hands them back", async () => {
	const expectedToolCalls = {
		topicSaves: ["Carl saved the new prompt."],
		topicSaveRejections: [],
		createdTopicId: "topic-1",
	}
	const toolCallsText = `${CHAT_TOOL_CALLS_MARKER}${JSON.stringify(expectedToolCalls)}`
	const { sendResult, streamedText, topicToolCalls } = await runChatTurn(["Done, saved.", toolCallsText])
	expect(sendResult).toBeNull()
	expect(streamedText).toBe("Done, saved.")
	expect(topicToolCalls).toEqual(expectedToolCalls)
})

// tool calls split across chunks stream no fragment of themselves
test("sendChatTurn holds back tool calls split across chunks", async () => {
	const toolCallsText = `${CHAT_TOOL_CALLS_MARKER}${JSON.stringify({ topicSaves: ["Carl added reddit — r/hoops."], topicSaveRejections: [] })}`
	const splitChunksAt = Math.floor(CHAT_TOOL_CALLS_MARKER.length / 2)
	const { streamedText, topicToolCalls } = await runChatTurn([
		`Done.${toolCallsText.slice(0, splitChunksAt)}`,
		toolCallsText.slice(splitChunksAt),
	])
	expect(streamedText).toBe("Done.")
	expect(topicToolCalls).toEqual({ topicSaves: ["Carl added reddit — r/hoops."], topicSaveRejections: [] })
})

// a reply that ends the way a marker begins is ordinary text once the stream drains
test("sendChatTurn shows a held marker-like tail once the stream drains", async () => {
	const { sendResult, streamedText, topicToolCalls } = await runChatTurn(["See [1]", "\n\n["])
	expect(sendResult).toBeNull()
	expect(streamedText).toBe("See [1]\n\n[")
	expect(topicToolCalls).toBeNull()
})
