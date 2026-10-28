import { afterEach, expect, test } from "bun:test"
import { stubFailingFetch, stubFetch } from "@carlnotes/client/fetchTestFixtures"
import { activateChatAccount } from "../stores/chatConversationStore"
import { DELETE_CHAT_MESSAGE_COPY } from "./chatCopy"
import { deleteChatRoomMessage } from "./chatRoomActions"

// restore the transport and account after each deletion scenario
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
	activateChatAccount(null)
})

test("rejected and offline deletions retain history and report failure", async () => {
	// preserve history when the server rejects deletion
	const effects = toDeletionEffects()
	stubFetch(new Response(null, { status: 403 }))
	await deleteChatRoomMessage(effects.options)
	expect(effects.events).toEqual([DELETE_CHAT_MESSAGE_COPY.failed])

	// preserve history when the connection fails
	effects.events.length = 0
	stubFailingFetch()
	await deleteChatRoomMessage(effects.options)
	expect(effects.events).toEqual([DELETE_CHAT_MESSAGE_COPY.failed])
})

test("accepted deletion refreshes history before reporting completion", async () => {
	// reload history before reporting the accepted deletion
	const effects = toDeletionEffects()
	stubFetch(new Response(null, { status: 204 }))
	await deleteChatRoomMessage(effects.options)
	expect(effects.events).toEqual(["reload", DELETE_CHAT_MESSAGE_COPY.succeeded])
})

test("retiring the account discards a delayed deletion result", async () => {
	// discard the result after account replacement
	const effects = toDeletionEffects()
	globalThis.fetch = (async () => {
		activateChatAccount("replacement-account")
		return new Response(null, { status: 204 })
	}) as unknown as typeof fetch
	await deleteChatRoomMessage(effects.options)
	expect(effects.events).toEqual([])
})

test("a refresh failure retains the accepted deletion's success notice", async () => {
	// retain success when the history refresh fails
	const effects = toDeletionEffects()
	stubFetch(new Response(null, { status: 204 }))
	await deleteChatRoomMessage({
		...effects.options,
		onReload: async () => {
			throw new Error("offline")
		},
	})
	expect(effects.events).toEqual([DELETE_CHAT_MESSAGE_COPY.succeeded])
})

// record the effects both platform adapters receive
function toDeletionEffects(): {
	events: string[]
	options: Parameters<typeof deleteChatRoomMessage>[0]
} {
	const events: string[] = []
	return {
		events,
		options: {
			topicId: null,
			teamId: "test-team",
			chatMessageId: 42,
			onReload: async () => {
				events.push("reload")
			},
			onNotice: (message) => events.push(message),
		},
	}
}
