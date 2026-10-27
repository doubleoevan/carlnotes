import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import type { ChatRoomMessage, RoomTopicToolCalls } from "@carlnotes/contracts/chat"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { signInAs, toSignedInApp } from "../testSession"
import * as roomAccess from "./roomAccess"
import { streamChatRoomEvents } from "./roomEvents"
import * as roomMessages from "./roomMessages"
import * as roomStream from "./roomStream"

// each test closes its reader before restoring the connection's collaborators
afterEach(() => mock.restore())

test.each(["membership", "session"])("room delivery stops when %s is revoked", async (revokedAccessKind) => {
	const connection = await openRoomStream()
	try {
		expect((await connection.reader.read()).value).toContain('"id":1')
		if (revokedAccessKind === "membership") {
			connection.loadChatRoomSpy.mockResolvedValue(null)
		} else {
			signInAs(null)
		}

		// queued deliveries and tool results are discarded after rejection
		connection.notifyChatRoomMessage(2, { topicSaves: ["Saved private settings"], topicSaveRejections: [] })
		connection.notifyChatRoomMessage(3)
		expect((await connection.reader.read()).done).toBe(true)
		expect(connection.stopListening).toHaveBeenCalledTimes(1)
		expect(connection.loadChatRoomDeltasSpy).toHaveBeenCalledTimes(1)
	} finally {
		await connection.reader.cancel()
	}
})

test("revocation during initial catch-up sends no history or queued notification", async () => {
	const chatMessageHistory = Promise.withResolvers<ChatRoomMessage[]>()
	const connection = await openRoomStream(chatMessageHistory.promise)
	try {
		connection.notifyChatRoomMessage(2)
		connection.loadChatRoomSpy.mockResolvedValue(null)
		chatMessageHistory.resolve([toChatMessage(1)])
		expect((await connection.reader.read()).done).toBe(true)
		expect(connection.loadChatRoomDeltasSpy).not.toHaveBeenCalled()
		expect(connection.stopListening).toHaveBeenCalledTimes(1)
	} finally {
		await connection.reader.cancel()
	}
})

test("a tool-only cancellation is delivered only while room access remains valid", async () => {
	const connection = await openRoomStream()
	try {
		await connection.reader.read()
		connection.loadChatRoomDeltasSpy.mockResolvedValue([])
		const cancellation = { topicSaves: [], topicSaveRejections: [], isTopicEditCancelled: true }
		connection.notifyChatRoomMessage(1, cancellation)
		expect((await connection.reader.read()).value).toContain('"isTopicEditCancelled":true')
		connection.loadChatRoomSpy.mockResolvedValue(null)
		connection.notifyChatRoomMessage(1, cancellation)
		expect((await connection.reader.read()).done).toBe(true)
	} finally {
		await connection.reader.cancel()
	}
})

// a connected reader and the server inputs each test can change
type RoomStreamTestConnection = {
	reader: ReadableStreamDefaultReader<string>
	loadChatRoomSpy: Mock<typeof roomAccess.loadChatRoom>
	loadChatRoomDeltasSpy: Mock<typeof roomMessages.loadChatRoomDeltas>
	stopListening: Mock<() => void>
	notifyChatRoomMessage: (id: number, toolCalls?: RoomTopicToolCalls) => void
}

// use the real SSE response with controlled authorization and pub/sub delivery
async function openRoomStream(
	chatMessageHistory = Promise.resolve([toChatMessage(1)]),
): Promise<RoomStreamTestConnection> {
	signInAs("reader")
	const loadChatRoomSpy = spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team" })
	spyOn(roomMessages, "loadChatRoomMessages").mockImplementation(() => chatMessageHistory)
	const loadChatRoomDeltasSpy = spyOn(roomMessages, "loadChatRoomDeltas").mockResolvedValue([toChatMessage(2)])
	const stopListening = mock(() => {})
	let notifyChatRoomMessage: (id: number, toolCalls?: RoomTopicToolCalls) => void = () => {}
	spyOn(roomStream, "onChatRoomMessage").mockImplementation((_topicId, _teamId, callback) => {
		notifyChatRoomMessage = (id, toolCalls = { topicSaves: [], topicSaveRejections: [] }) => callback(id, toolCalls)
		return stopListening
	})
	const route = new Hono<AppEnv>().get("/events", (context) => streamChatRoomEvents(context, null, "team"))
	const response = await toSignedInApp(route, "reader").request("/events")
	if (!response.body) {
		throw new Error("Expected a room event stream")
	}
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
	return { reader, loadChatRoomSpy, loadChatRoomDeltasSpy, stopListening, notifyChatRoomMessage }
}

// protected text makes an unintended event observable
function toChatMessage(id: number): ChatRoomMessage {
	return {
		id,
		content: "Private room message",
		authorUserId: "reader",
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
