import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { ChatRoomMessagePage } from "@carlnotes/contracts/chat"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { type ChatRoomState, FIRST_ITEM_INDEX_START, useChatRoom } from "@carlnotes/core/hooks/useChatRoom"
import { useRoomMembers } from "@carlnotes/core/hooks/useRoomMembers"
import { useRoomReply } from "@carlnotes/core/hooks/useRoomReply"
import type { ChatRoomHandlers } from "@carlnotes/core/lib/chatRoomStream"
import { toStoryRoomMessage } from "@carlnotes/core/lib/chatStoryFixtures"
import { activateChatAccount, setChatId, toTopicEdit } from "@carlnotes/core/stores/chatConversationStore"
import { act } from "react"
import { type HookTestHarness, renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// each mounted room owns its transport callbacks and fetch stub
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	activateChatAccount(null)
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("room members reuse the loaded Team but fetch when a different room is selected", async () => {
	// supply the already loaded Team membership
	const loadedTeam: TeamPageResponse = {
		teamId: "team",
		name: "Our team",
		description: null,
		isPublic: false,
		avatarVersion: null,
		role: "leader",
		hasRequestedToJoin: false,
		hiddenMemberCount: 0,
		chatMentions: [],
		topics: [],
		members: [
			{
				userId: "friend",
				username: "friend",
				avatarSource: null,
				avatarVersion: null,
				role: "member",
				isMemberVisible: true,
				isActive: true,
			},
		],
	}
	// count additional Team reads
	let fetchCount = 0
	let teamId = "team"
	globalThis.fetch = (async () => {
		fetchCount += 1
		return Response.json({ ...loadedTeam, teamId: "other", role: "member", members: [] })
	}) as unknown as typeof fetch
	const chatRoomHarness = await renderTestHook(() => useRoomMembers(teamId, "me", loadedTeam))
	// close the mounted hook after the test
	cleanups.push(chatRoomHarness.close)
	expect(chatRoomHarness.read()).toEqual({ memberUsernames: ["friend"], isTeamLeader: true })
	expect(fetchCount).toBe(0)
	// change rooms and require fresh membership
	teamId = "other"
	await chatRoomHarness.render()
	await waitForHook(() => fetchCount === 1 && !chatRoomHarness.read().isTeamLeader)
	expect(chatRoomHarness.read().memberUsernames).toEqual([])
})

test("room pages and live replays keep ordering, distinct rows, and web virtual indices", async () => {
	// mount the room with controlled server events
	const { chatRoomHarness, chatRoomHandlers } = await mountChatRoom()
	await act(async () =>
		chatRoomHandlers().onChatMessagesLoaded(
			toChatRoomMessagePage({ chatMessageIds: [4, 5, 4], hasEarlierChatMessages: true }),
		),
	)
	globalThis.fetch = (async () =>
		Response.json(
			toChatRoomMessagePage({ chatMessageIds: [1, 2, 2, 4], hasEarlierChatMessages: false }),
		)) as unknown as typeof fetch
	await act(async () => {
		expect(await chatRoomHarness.read().loadEarlierChatMessages()).toBe(2)
	})
	await act(async () => {
		chatRoomHandlers().onChatMessage(toStoryRoomMessage({ id: 7 }))
		chatRoomHandlers().onChatMessage(toStoryRoomMessage({ id: 6 }))
		chatRoomHandlers().onChatMessage(toStoryRoomMessage({ id: 7 }))
	})
	expect(chatRoomHarness.read().chatMessages.map((message) => message.id)).toEqual([1, 2, 4, 5, 6, 7])
	expect(chatRoomHarness.read().firstItemIndex).toBe(FIRST_ITEM_INDEX_START - 2)
	expect(chatRoomHarness.read().hasEarlierChatMessages).toBe(false)
})

test("failed room reads stay retryable and a rejected post keeps the room history", async () => {
	// mount the room with controlled server events
	const { chatRoomHarness, chatRoomHandlers } = await mountChatRoom()
	await act(async () => chatRoomHandlers().onLoadFailed?.())
	expect(chatRoomHarness.read().hasLoadFailed).toBe(true)
	expect(chatRoomHarness.read().isRejected).toBe(false)
	await act(async () =>
		chatRoomHandlers().onChatMessagesLoaded(
			toChatRoomMessagePage({ chatMessageIds: [4], hasEarlierChatMessages: false }),
		),
	)
	globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch
	await act(async () => {
		expect(
			await chatRoomHarness.read().postChatMessage({ content: "hello", replyToChatMessageId: null, attachments: [] }),
		).toBe(false)
	})
	expect(chatRoomHarness.read().chatMessages).toHaveLength(1)
	expect(chatRoomHarness.read().hasLoadFailed).toBe(false)
})

test("late earlier pages cannot enter a replacement account", async () => {
	// mount the room with controlled server events
	const { chatRoomHarness, chatRoomHandlers } = await mountChatRoom()
	await act(async () =>
		chatRoomHandlers().onChatMessagesLoaded(
			toChatRoomMessagePage({ chatMessageIds: [4], hasEarlierChatMessages: true }),
		),
	)
	// hold the earlier page until the account changes
	const delayedEarlierMessagesResponse = Promise.withResolvers<Response>()
	globalThis.fetch = (() => delayedEarlierMessagesResponse.promise) as unknown as typeof fetch
	let loadEarlierMessagesPromise: Promise<number> | undefined
	await act(async () => {
		loadEarlierMessagesPromise = chatRoomHarness.read().loadEarlierChatMessages()
	})
	// discard the old account's delayed page
	activateChatAccount("replacement")
	await act(async () => {
		delayedEarlierMessagesResponse.resolve(
			Response.json(toChatRoomMessagePage({ chatMessageIds: [1], hasEarlierChatMessages: false })),
		)
		expect(await loadEarlierMessagesPromise).toBe(0)
	})
	expect(chatRoomHarness.read().chatMessages.map((message) => message.id)).toEqual([4])
})

test("room recovery clears a pending answer without treating an old replay as a new answer", async () => {
	// mount the room with controlled server events
	const { chatRoomHarness, chatRoomHandlers } = await mountChatRoom()
	await act(async () =>
		chatRoomHandlers().onChatMessagesLoaded(
			toChatRoomMessagePage({ chatMessageIds: [4], hasEarlierChatMessages: false }),
		),
	)
	globalThis.fetch = (async () => Response.json({ chatMessageId: 8, rejectionReason: null })) as unknown as typeof fetch
	await act(async () => {
		await chatRoomHarness
			.read()
			.postChatMessage({ content: "@carl hello", replyToChatMessageId: null, attachments: [] })
	})
	expect(chatRoomHarness.read().isMessageLoading).toBe(true)
	await act(async () =>
		chatRoomHandlers().onChatMessage(toStoryRoomMessage({ id: 3, authorUserId: null, authorUsername: "Carl" })),
	)
	expect(chatRoomHarness.read().isMessageLoading).toBe(true)
	await act(async () =>
		chatRoomHandlers().onChatMessagesLoaded({
			...toChatRoomMessagePage({ chatMessageIds: [8], hasEarlierChatMessages: false }),
			chatMessages: [
				toStoryRoomMessage({ id: 8 }),
				toStoryRoomMessage({ id: 9, authorUserId: null, authorUsername: "Carl" }),
				toStoryRoomMessage({ id: 10 }),
			],
		}),
	)
	expect(chatRoomHarness.read().isMessageLoading).toBe(false)
})

test("a fast room answer arriving before POST completion never leaves a waiting bubble", async () => {
	// mount the room with controlled server events
	const { chatRoomHarness, chatRoomHandlers } = await mountChatRoom()
	// hold the post while its answer arrives
	const postChatMessageResponse = Promise.withResolvers<Response>()
	globalThis.fetch = (() => postChatMessageResponse.promise) as unknown as typeof fetch
	let postChatMessagePromise: Promise<boolean> | undefined
	await act(async () => {
		postChatMessagePromise = chatRoomHarness
			.read()
			.postChatMessage({ content: "@carl hello", replyToChatMessageId: null, attachments: [] })
	})
	await act(async () => {
		chatRoomHandlers().onChatMessage(toStoryRoomMessage({ id: 9, authorUserId: null, authorUsername: "Carl" }))
		postChatMessageResponse.resolve(Response.json({ chatMessageId: 8, rejectionReason: null }))
		expect(await postChatMessagePromise).toBe(true)
	})
	expect(chatRoomHarness.read().isMessageLoading).toBe(false)
})

test("manual replies survive new messages but clear when their parent disappears", async () => {
	// seed an automatic reply to a member
	let chatMessages = [
		toStoryRoomMessage({ id: 1, authorUserId: "me" }),
		toStoryRoomMessage({ id: 2, authorUserId: "friend", replyToChatMessageId: 1 }),
	]
	const chatRoomHarness = await renderTestHook(() => useRoomReply({ chatMessages: chatMessages, isLoaded: true }, "me"))
	// close the mounted hook after the test
	cleanups.push(chatRoomHarness.close)
	await waitForHook(() => chatRoomHarness.read().replyTo?.id === 2)
	expect(chatRoomHarness.read().isAutoReply).toBe(true)
	await act(async () => chatRoomHarness.read().selectChatMessage(toStoryRoomMessage({ id: 1, authorUserId: "me" })))
	// preserve the selected reply through live arrivals
	chatMessages = [...chatMessages, toStoryRoomMessage({ id: 3, authorUserId: "friend" })]
	await chatRoomHarness.render()
	expect(chatRoomHarness.read().replyTo?.id).toBe(1)
	// clear the reply when its target disappears
	chatMessages = chatMessages.filter((message) => message.id !== 1)
	await chatRoomHarness.render()
	await waitForHook(() => chatRoomHarness.read().replyTo === null)
})

test("room proposals and cancellations belong to their recipient, while accepted saves reach every member", async () => {
	// another member's proposal must not open this member's draft
	const { chatRoomHandlers } = await mountChatRoom()
	const toolCalls = {
		proposedToUserId: "friend",
		proposedTopicEdit: { tags: ["proposed"] },
		isTopicEditCancelled: false,
		topicSaves: [],
		topicSaveRejections: [],
	}
	await act(async () => chatRoomHandlers().onTopicToolCalls(toolCalls))
	expect(toTopicEdit("topic")).toBeNull()

	// keep this member's proposal when another member cancels their own edit
	await act(async () => chatRoomHandlers().onTopicToolCalls({ ...toolCalls, proposedToUserId: "me" }))
	await act(async () =>
		chatRoomHandlers().onTopicToolCalls({ ...toolCalls, proposedTopicEdit: undefined, isTopicEditCancelled: true }),
	)
	expect(toTopicEdit("topic")?.proposedTopicEdit).toEqual({ tags: ["proposed"] })

	// an accepted save clears the preview so the card can reload the authoritative Topic
	await act(async () =>
		chatRoomHandlers().onTopicToolCalls({ ...toolCalls, proposedTopicEdit: undefined, topicSaves: ["Saved tags."] }),
	)
	expect(toTopicEdit("topic")?.proposedTopicEdit).toBeNull()
})

// mount the shared hook with controlled server events
async function mountChatRoom(): Promise<{
	chatRoomHarness: HookTestHarness<ChatRoomState>
	chatRoomHandlers: () => ChatRoomHandlers
}> {
	// select the room and attach controlled stream callbacks
	activateChatAccount("account")
	setChatId({ kind: "room", topicId: "topic", teamId: "team" })
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
	let chatRoomHandlers: ChatRoomHandlers
	const chatRoomHarness = await renderTestHook(() =>
		useChatRoom({
			topicId: "topic",
			teamId: "team",
			userId: "me",
			onNotice: () => {},
			useStream: (_topic, _team, callbacks) => {
				chatRoomHandlers = callbacks
			},
		}),
	)
	// close the mounted hook after the test
	cleanups.push(chatRoomHarness.close)
	return { chatRoomHarness, chatRoomHandlers: () => chatRoomHandlers }
}
// the message ids and pagination state of one server response
type ToChatRoomMessagePageOptions = {
	chatMessageIds: number[]
	hasEarlierChatMessages: boolean
}

// build an ordered server message page
function toChatRoomMessagePage({
	chatMessageIds,
	hasEarlierChatMessages,
}: ToChatRoomMessagePageOptions): ChatRoomMessagePage {
	return {
		chatMessages: chatMessageIds.map((id) => toStoryRoomMessage({ id })),
		hasEarlierChatMessages,
		isVoiceChatConfigured: false,
	}
}
