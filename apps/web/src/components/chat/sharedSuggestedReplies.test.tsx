// the shared conversation's suggested reply: the saved line frees the composer while the stream reads on, a second question
// can go while the first turn's suggestion is on its way, a late suggestion never replaces the newer turn's, and a
// created topic's conversation ends once
import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { ChatConversation } from "@carlnotes/contracts/chat"
import { type ChatReplyLine, toChatReplyLineText } from "@carlnotes/contracts/chatTurns"
import { type TopicChat, useTopicChat } from "@carlnotes/core/hooks/useTopicChat"
import { activateChatAccount } from "@carlnotes/core/stores/chatConversationStore"
import { act } from "react"
import { type HookTestHarness, renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// each test owns fetch, the account identity, and its mounted React environment
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0).reverse()) {
		await close()
	}
	globalThis.fetch = originalFetch
	activateChatAccount(null)
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

// a reply stream the test writes lines into and closes
type HeldReplyStream = { response: Response; write: (line: ChatReplyLine) => void; close: () => void }

// a reply stream held open until the test closes it
function toHeldReplyStream(): HeldReplyStream {
	let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
	const response = new Response(
		new ReadableStream({
			start(controller) {
				streamController = controller
			},
		}),
	)
	return {
		response,
		write: (line) => streamController?.enqueue(new TextEncoder().encode(toChatReplyLineText(line))),
		close: () => streamController?.close(),
	}
}

// the loaded new-topic conversation, and each request the hook sends, answered by the test
type ChatRequest = { method: string; url: string }
function stubChatFetch(onPost: () => Response, requests: ChatRequest[]): void {
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const method = init?.method ?? "GET"
		requests.push({ method, url: String(input) })
		// a post streams a reply, a delete clears, and a read loads the empty conversation
		if (method === "POST") {
			return onPost()
		}
		if (method === "DELETE") {
			return Response.json({ ok: true })
		}
		return Response.json(toChatConversation())
	}) as typeof fetch
}

// an empty conversation the user may chat in, with suggested replies on
function toChatConversation(): ChatConversation {
	return {
		chatTurns: [],
		canChat: true,
		canEditTopic: false,
		isSignupRequired: false,
		isBudgetExhausted: false,
		isVoiceChatConfigured: false,
		keptAttachments: [],
		isSuggestedReplyOn: true,
	}
}

// mount the new-topic conversation and wait for its load
async function mountTopicChat(): Promise<HookTestHarness<TopicChat>> {
	activateChatAccount("user-1")
	const topicChatHarness = await renderTestHook(() => useTopicChat({ page: { newTopic: true }, onNotice: () => {} }))
	cleanups.push(topicChatHarness.close)
	await waitForHook(() => topicChatHarness.read().canChat)
	return topicChatHarness
}

// wait a moment for the streamed lines to reach the hook
async function settle(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10))
	})
}

test("the saved line frees Send while the stream reads on, and a second question can go", async () => {
	// two held replies, one per post
	const heldReplyStreams = [toHeldReplyStream(), toHeldReplyStream()]
	const requests: ChatRequest[] = []
	let postCount = 0
	stubChatFetch(() => heldReplyStreams[postCount++]?.response ?? new Response(null, { status: 500 }), requests)
	const topicChatHarness = await mountTopicChat()

	// the first reply's text and its end, with the stream still open
	let firstSend: Promise<void> | undefined
	await act(async () => {
		firstSend = topicChatHarness.read().send("espresso machines")
	})
	heldReplyStreams[0]?.write({ type: "text", text: "How often should I look?" })
	heldReplyStreams[0]?.write({ type: "saved" })
	await settle()
	expect(topicChatHarness.read().isStreaming).toBe(false)

	// a second question goes while the first stream waits on its suggestion
	await act(async () => {
		void topicChatHarness.read().send("Weekly is fine")
	})
	expect(requests.filter((request) => request.method === "POST")).toHaveLength(2)
	expect(topicChatHarness.read().isStreaming).toBe(true)

	// the first turn's late suggestion never becomes the one held
	heldReplyStreams[0]?.write({ type: "suggestedReply", suggestedReply: "Daily, please" })
	heldReplyStreams[0]?.close()
	await act(async () => {
		await firstSend
	})
	expect(topicChatHarness.read().receivedSuggestedReply).toBeNull()

	// the second turn's suggestion is held for the second turn
	heldReplyStreams[1]?.write({ type: "text", text: "Got it." })
	heldReplyStreams[1]?.write({ type: "saved" })
	heldReplyStreams[1]?.write({ type: "suggestedReply", suggestedReply: "Thanks" })
	heldReplyStreams[1]?.close()
	await settle()
	const secondTurnKey = topicChatHarness.read().chatTurns.at(-1)?.spokenAnswerKey
	expect(topicChatHarness.read().receivedSuggestedReply).toMatchObject({
		spokenAnswerKey: secondTurnKey,
		text: "Thanks",
	})
})

test("a stream with no saved line frees Send when it closes", async () => {
	const heldReplyStream = toHeldReplyStream()
	stubChatFetch(() => heldReplyStream.response, [])
	const topicChatHarness = await mountTopicChat()

	// the text alone keeps the composer streaming until the close
	await act(async () => {
		void topicChatHarness.read().send("espresso machines")
	})
	heldReplyStream.write({ type: "text", text: "How often should I look?" })
	await settle()
	expect(topicChatHarness.read().isStreaming).toBe(true)
	heldReplyStream.close()
	await settle()
	expect(topicChatHarness.read().isStreaming).toBe(false)
})

test("a created topic's conversation ends once, at the saved line", async () => {
	const heldReplyStream = toHeldReplyStream()
	const requests: ChatRequest[] = []
	stubChatFetch(() => heldReplyStream.response, requests)
	const topicChatHarness = await mountTopicChat()

	// the create's tool calls, the reply's end, and the close
	await act(async () => {
		void topicChatHarness.read().send("Yes, create it")
	})
	heldReplyStream.write({ type: "text", text: "Done." })
	heldReplyStream.write({
		type: "toolCalls",
		toolCalls: { topicSaves: [], topicSaveRejections: [], createdTopicId: "topic-9" },
	})
	heldReplyStream.write({ type: "saved" })
	await settle()
	heldReplyStream.close()
	await settle()
	expect(requests.filter((request) => request.method === "DELETE")).toHaveLength(1)
})
