import { expect, test } from "bun:test"
import type { ChatRoomMessage, ChatRoomMessagePage } from "@carlnotes/contracts/chat"
import { type ChatRoomEvents, openChatRoomStream } from "./chatRoomStream"

test("reconnect resumes after the highest id and rejects retired connection callbacks", async () => {
	// own transport doubles instead of opening a network connection
	const connections: { url: string; events: ChatRoomEvents; closed: boolean }[] = []
	const deliveredChatMessageCount: number[] = []
	const close = openChatRoomStream({
		topicId: "topic",
		teamId: "team",
		loadMessages: async () => page([8, 3]),
		handlers: {
			onChatMessagesLoaded: () => {},
			onChatMessage: (message) => deliveredChatMessageCount.push(message.id),
			onTopicToolCalls: () => {},
		},
		connectEvents: async (url, events) => {
			const connection = { url, events, closed: false }
			connections.push(connection)
			return () => {
				connection.closed = true
			}
		},
	})
	try {
		await waitUntil(() => connections.length === 1)
		expect(connections[0]?.url).toEndWith("after=8")
		connections[0]?.events.onMessage(message(12))
		connections[0]?.events.onMessage(message(9))
		connections[0]?.events.onError()
		connections[0]?.events.onMessage(message(99))
		await waitUntil(() => connections.length === 2)
		expect(connections[0]?.closed).toBe(true)
		expect(connections[1]?.url).toEndWith("after=12")
		expect(deliveredChatMessageCount).toEqual([12, 9])
		close()
		connections[1]?.events.onMessage(message(100))
		expect(deliveredChatMessageCount).toEqual([12, 9])
		expect(connections[1]?.closed).toBe(true)
	} finally {
		close()
	}
})

test("closing during history or asynchronous session lookup cannot publish or retain a stream", async () => {
	const loaded = Promise.withResolvers<ChatRoomMessagePage>()
	let published = 0
	let isConnected = 0
	const handlers = {
		onChatMessagesLoaded: () => {
			published += 1
		},
		onChatMessage: () => {},
		onTopicToolCalls: () => {},
	}
	const close = openChatRoomStream({
		topicId: null,
		teamId: "team",
		handlers,
		loadMessages: () => loaded.promise,
		connectEvents: async () => {
			isConnected += 1
			return () => {}
		},
	})
	close()
	loaded.resolve(page([1]))
	await new Promise((resolve) => setTimeout(resolve, 5))
	expect(published).toBe(0)
	expect(isConnected).toBe(0)

	// a connection resolved after disposal immediately closes its native resource
	const connecting = Promise.withResolvers<() => void>()
	let isClosed = false
	const closeLate = openChatRoomStream({
		topicId: null,
		teamId: "team",
		handlers,
		loadMessages: async () => page([1]),
		connectEvents: () => connecting.promise,
	})
	await waitUntil(() => published === 1)
	closeLate()
	connecting.resolve(() => {
		isClosed = true
	})
	await waitUntil(() => isClosed)
})

test("a transient read retries while denied room access never connects", async () => {
	let attemptCount = 0
	let failureCount = 0
	let isDenied = false
	let isConnected = false
	const close = openChatRoomStream({
		topicId: null,
		teamId: "team",
		loadMessages: async () => {
			attemptCount += 1
			return attemptCount === 1 ? "failed" : null
		},
		handlers: {
			onLoadFailed: () => {
				failureCount += 1
			},
			onChatMessagesLoaded: (chatMessagePage) => {
				isDenied = chatMessagePage === null
			},
			onChatMessage: () => {},
			onTopicToolCalls: () => {},
		},
		connectEvents: async () => {
			isConnected = true
			return () => {}
		},
	})
	try {
		await waitUntil(() => isDenied)
		expect(failureCount).toBe(1)
		expect(attemptCount).toBe(2)
		expect(isConnected).toBe(false)
	} finally {
		close()
	}
})

test.each([401, 403, 404])(
	"a stream denied with %i closes without reconnecting or accepting late messages",
	async (status) => {
		let connection: ChatRoomEvents | undefined
		let attemptCount = 0
		let isClosed = false
		let isDenied = false
		let deliveredChatMessageCount = 0
		const close = openChatRoomStream({
			topicId: null,
			teamId: "team",
			loadMessages: async () => page([1]),
			handlers: {
				onChatMessagesLoaded: (chatMessagePage) => {
					isDenied = chatMessagePage === null
				},
				onChatMessage: () => {
					deliveredChatMessageCount += 1
				},
				onTopicToolCalls: () => {},
			},
			connectEvents: async (_url, events) => {
				attemptCount += 1
				connection = events
				return () => {
					isClosed = true
				}
			},
		})
		try {
			await waitUntil(() => connection !== undefined)
			connection?.onError(status)
			connection?.onMessage(message(2))
			expect(isClosed).toBe(true)
			expect(isDenied).toBe(true)
			expect(deliveredChatMessageCount).toBe(0)
			await new Promise((resolve) => setTimeout(resolve, 1100))
			expect(attemptCount).toBe(1)
		} finally {
			close()
		}
	},
)

// wait only for observable controller progress, bounded below Bun's test timeout
async function waitUntil(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 2500
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error("room did not settle")
		}
		await new Promise((resolve) => setTimeout(resolve, 5))
	}
}
function page(ids: number[]): ChatRoomMessagePage {
	return { chatMessages: ids.map(message), hasEarlierChatMessages: false, isVoiceChatConfigured: false }
}
function message(id: number): ChatRoomMessage {
	return {
		id,
		content: "hello",
		authorUserId: "u",
		authorUsername: "reader",
		authorAvatarSource: null,
		authorAvatarVersion: null,
		replyToChatMessageId: null,
		createdAt: "2026-10-27T12:00:00Z",
		isSpoken: false,
		attachments: [],
		linkPreviews: [],
	}
}
