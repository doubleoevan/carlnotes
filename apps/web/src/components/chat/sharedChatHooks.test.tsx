import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { ChatPage } from "@carlnotes/client/chatClient"
import type { ChatConversation, KeptChatAttachment } from "@carlnotes/contracts/chat"
import { toChatReplyLineText } from "@carlnotes/contracts/chatTurns"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { type TopicChat, useTopicChat } from "@carlnotes/core/hooks/useTopicChat"
import {
	activateChatAccount,
	clearProposedTopicEdit,
	publishTopicChanged,
	setChatId,
	startEditingTopic,
	toTopicEdit,
} from "@carlnotes/core/stores/chatConversationStore"
import { act, useState } from "react"
import { type HookTestHarness, renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// each hook test owns fetch, the account identity, and its mounted React environment
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	// close the last mounted harness first. each harness restores the globals from before it
	for (const close of cleanups.splice(0).reverse()) {
		await close()
	}
	globalThis.fetch = originalFetch
	activateChatAccount(null)
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("failed history stays closed until retry, and an exhausted creation quota permits existing Topic chat", async () => {
	// count history reads and chat posts
	let historyReadCount = 0
	// count submissions while keeping the reply open
	let chatPostCount = 0
	stubChatFetch(async (_url, init) => {
		if (init?.method === "POST") {
			chatPostCount += 1
			return toChatReplyResponse("Ready.")
		}
		historyReadCount += 1
		return historyReadCount === 1
			? new Response(null, { status: 500 })
			: Response.json(toChatConversation({ topicsRemaining: 0, topicLimit: 3 }))
	})
	// mount and exercise the conversation
	const topicChatHarness = await mountTopicChat()
	await waitForHook(() => topicChatHarness.read().hasLoadFailed)
	await act(async () => topicChatHarness.read().send("Should wait"))
	expect(chatPostCount).toBe(0)
	await act(async () => topicChatHarness.read().reload())
	await waitForHook(() => topicChatHarness.read().canChat)
	await act(async () => topicChatHarness.read().send("Existing Topic question"))
	expect(chatPostCount).toBe(1)
	expect(topicChatHarness.read().chatTurns[0]?.answer).toBe("Ready.")
})

test("account replacement rejects the old history and its restored proposal", async () => {
	// hold the old account response until the account changes
	const delayedHistoryResponse = Promise.withResolvers<Response>()
	// count history reads and chat posts
	let historyReadCount = 0
	stubChatFetch(async () => {
		historyReadCount += 1
		return historyReadCount === 1 ? delayedHistoryResponse.promise : Response.json(toChatConversation())
	})
	// mount and exercise the conversation
	const topicChatHarness = await mountTopicChat()
	await act(async () => {
		activateChatAccount("second-account")
		setChatId({ kind: "private", topicId: "topic-1" })
	})
	await waitForHook(() => topicChatHarness.read().isLoaded)
	await act(async () =>
		delayedHistoryResponse.resolve(
			Response.json(
				toChatConversation({
					chatTurns: [
						{
							question: "private old text",
							answer: "old",
							at: "2026-10-27T12:00:00Z",
							isSpoken: false,
							speaker: "host",
							podcastEpisodeChapter: null,
							answerLinkPreviews: [],
							attachments: [],
							linkPreviews: [],
							toolCalls: [{ toolName: "proposeTopicEdit", input: { tags: ["secret"] }, output: "" }],
						},
					],
				}),
			),
		),
	)
	// reject stale or cleared conversation contents
	expect(topicChatHarness.read().chatTurns).toEqual([])
	expect(toTopicEdit("topic-1")).toBeNull()
})

test("clear preserves history after rejection and removes it only after server acceptance", async () => {
	let isAccepted = false
	stubChatFetch(async (_url, init) =>
		init?.method === "DELETE"
			? new Response(null, { status: isAccepted ? 204 : 403 })
			: Response.json(
					toChatConversation({
						chatTurns: [
							{
								question: "keep",
								answer: "answer",
								at: "2026-10-27T12:00:00Z",
								isSpoken: false,
								speaker: "host",
								podcastEpisodeChapter: null,
								answerLinkPreviews: [],
								attachments: [],
								linkPreviews: [],
							},
						],
					}),
				),
	)
	// mount and exercise the conversation
	const topicChatHarness = await mountTopicChat()
	await waitForHook(() => topicChatHarness.read().isLoaded)
	await act(async () => {
		expect(await topicChatHarness.read().clear()).toBe(false)
	})
	expect(topicChatHarness.read().chatTurns).toHaveLength(1)
	isAccepted = true
	await act(async () => {
		expect(await topicChatHarness.read().clear()).toBe(true)
	})
	// reject stale or cleared conversation contents
	expect(topicChatHarness.read().chatTurns).toEqual([])
})

test("stopping a tool-only answer keeps its tool history and does not replay a POST", async () => {
	// count submissions while keeping the reply open
	let chatPostCount = 0
	stubChatFetch(async (_url, init) => {
		if (init?.method !== "POST") {
			return Response.json(toChatConversation())
		}
		chatPostCount += 1
		return new Response(
			new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(
							toChatReplyLineText({
								type: "toolCalls",
								toolCalls: {
									topicSaves: [],
									topicSaveRejections: [],
									chatToolCalls: [{ toolName: "readTopic", input: {}, output: "read" }],
								},
							}),
						),
					)
					init.signal?.addEventListener("abort", () => controller.error(new Error("native cancelled")), { once: true })
				},
			}),
		)
	})
	// mount and exercise the conversation
	const topicChatHarness = await mountTopicChat()
	await waitForHook(() => topicChatHarness.read().isLoaded)
	// interrupt the answer after its tool result arrives
	let sendChatPromise: Promise<void> | undefined
	await act(async () => {
		sendChatPromise = topicChatHarness.read().send("Read the topic")
	})
	await waitForHook(() => Boolean(topicChatHarness.read().chatTurns[0]?.toolCalls?.length))
	await act(async () => {
		topicChatHarness.read().stop()
		await sendChatPromise
	})
	// retain tool history without replaying the request
	expect(topicChatHarness.read().isStreaming).toBe(false)
	expect(topicChatHarness.read().chatTurns[0]?.toolCalls).toHaveLength(1)
	expect(chatPostCount).toBe(1)
})

test("a sent file joins the kept files on a topic's page and never in the new-topic chat", async () => {
	// reply to every send at once
	stubChatFetch(async (_url, init) =>
		init?.method === "POST" ? toChatReplyResponse("Read it.") : Response.json(toChatConversation()),
	)
	// send a kept file from a topic's page, which the api stores the file for
	setChatId({ kind: "private", topicId: "topic-1" })
	const topicChatHarness = await mountChatWithKeptFile({ topicId: "topic-1" })
	await waitForHook(() => topicChatHarness.read().isLoaded)
	await act(async () => topicChatHarness.read().send())
	expect(topicChatHarness.read().keptAttachments.map((keptAttachment) => keptAttachment.name)).toEqual(["notes.md"])
	// send the same file from the new-topic chat, where the api keeps nothing
	setChatId({ kind: "private", newTopic: true })
	const newTopicChatHarness = await mountChatWithKeptFile({ newTopic: true })
	await waitForHook(() => newTopicChatHarness.read().isLoaded)
	await act(async () => newTopicChatHarness.read().send())
	expect(newTopicChatHarness.read().chatTurns).toHaveLength(1)
	expect(newTopicChatHarness.read().keptAttachments).toEqual([])
})

test("the edit card overlays proposals and rereads authoritative settings after a save", async () => {
	// serve the authoritative Topic name
	let topicName = "Original"
	stubChatFetch(async (url) =>
		url.endsWith("/chat")
			? Response.json(toChatConversation())
			: Response.json(toTestTopicResponse({ name: topicName, canEdit: true })),
	)
	// mount and exercise the conversation
	const topicChatHarness = await mountTopicChat()
	await waitForHook(() => topicChatHarness.read().isLoaded)
	await act(async () => startEditingTopic("topic-1", { name: "Proposed" }))
	await waitForHook(() => Boolean(topicChatHarness.read().editableTopicDraft))
	expect(topicChatHarness.read().editableTopicDraft).toMatchObject({
		topicDraft: { name: "Proposed" },
		isTopicEditProposed: true,
	})
	// accept the edit and reload the saved Topic
	topicName = "Saved by server"
	await act(async () => {
		clearProposedTopicEdit()
		startEditingTopic("topic-1")
		publishTopicChanged("topic-1")
	})
	await waitForHook(() => topicChatHarness.read().editableTopicDraft?.topicDraft.name === topicName)
	expect(topicChatHarness.read().editableTopicDraft?.isTopicEditProposed).toBe(false)
})

// mount the universal hook in the browser harness
async function mountTopicChat(): Promise<HookTestHarness<TopicChat>> {
	// initialize the selected conversation and mount its hook
	activateChatAccount("account")
	setChatId({ kind: "private", topicId: "topic-1" })
	const topicChatHarness = await renderTestHook(() =>
		useTopicChat({ page: { topicId: "topic-1" }, effects: { onNotice: () => {} } }),
	)
	// retain cleanup until the test finishes
	cleanups.push(topicChatHarness.close)
	return topicChatHarness
}
// mount a conversation whose composer holds one file marked to keep
async function mountChatWithKeptFile(page: ChatPage): Promise<HookTestHarness<TopicChat>> {
	activateChatAccount("account")
	const topicChatHarness = await renderTestHook(() => {
		const [keptAttachments, setKeptAttachments] = useState<KeptChatAttachment[]>([])
		return useTopicChat({
			page,
			attachmentState: {
				attachments: [{ kind: "text", name: "notes.md", text: "the notes", keep: true }],
				keptAttachments,
				setKeptAttachments,
				clearDraft: () => {},
			},
			effects: { onNotice: () => {} },
		})
	})
	// retain cleanup until the test finishes
	cleanups.push(topicChatHarness.close)
	return topicChatHarness
}
// control conversation responses through the real client
function stubChatFetch(request: (url: string, init?: RequestInit) => Promise<Response>): void {
	// replace the request function for this test
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => request(String(input), init)) as typeof fetch
}
// build a loaded private conversation
function toChatConversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
	return {
		chatTurns: [],
		canChat: true,
		canEditTopic: true,
		isSignupRequired: false,
		isBudgetExhausted: false,
		isVoiceChatConfigured: false,
		keptAttachments: [],
		...overrides,
	}
}
// stream one answer through the response decoder
function toChatReplyResponse(text: string): Response {
	return new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(toChatReplyLineText({ type: "text", text })))
				controller.close()
			},
		}),
	)
}
