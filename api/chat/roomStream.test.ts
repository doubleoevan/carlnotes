// chat room broker tests: the local delivery, the skipped echo, another instance's payload,
// and a payload without tool calls
import { afterAll, expect, mock, spyOn, test } from "bun:test"
import type { RoomTopicToolCalls } from "@shared/contracts"
import * as redis from "../../db/redis"
import { notifyChatRoomMessage, onChatRoomMessage, toChatRoomPayload } from "./roomStream"

// the payloads that this instance published, and the channel handler that the broker subscribed with
const publishedChatRoomPayloads: string[] = []
let deliverChatRoomPayload: (chatRoomPayload: string) => void = () => {}
spyOn(redis, "publishToChannel").mockImplementation(async ({ channelMessage }: redis.PublishToChannelOptions) => {
	publishedChatRoomPayloads.push(channelMessage)
	return true
})

// keep the channel handler that the broker subscribes with, so a test can deliver another instance's payload
spyOn(redis, "subscribeToChannel").mockImplementation(
	(_channel: string, onChannelMessage: (channelMessage: string) => void) => {
		deliverChatRoomPayload = onChannelMessage
	},
)

// put the spied Redis functions back after the last test
afterAll(() => {
	mock.restore()
})

// the tool calls that a chat message arrives with if no topic tool left any
const EMPTY_ROOM_TOPIC_TOOL_CALLS: RoomTopicToolCalls = { topicSaves: [], topicSaveRejections: [] }

// a stored chat message reaches this instance's subscribers from the local emit,
// and the echo of this instance's own payload adds nothing
test("a stored chat message reaches this instance once, before publishing and not again from the echo", async () => {
	// one subscriber on the topic's chat room
	const receivedChatMessageIds: number[] = []
	const stopListening = onChatRoomMessage("t1", "team-1", (chatMessageId) => receivedChatMessageIds.push(chatMessageId))

	// the local emit delivers the chat message id. the payload names this instance, the chat room, and the chat message id
	await notifyChatRoomMessage("t1", "team-1", 7)
	expect(receivedChatMessageIds).toEqual([7])
	expect(publishedChatRoomPayloads.at(-1)).toMatch(/^[0-9a-f-]{36}:t1:team-1:7$/)

	// the echo of this instance's own payload is skipped
	deliverChatRoomPayload(publishedChatRoomPayloads.at(-1) as string)
	expect(receivedChatMessageIds).toEqual([7])
	stopListening()
})

// another instance's payload is delivered with the chat message id and the tool calls intact, no matter how large
test("another instance's payload is delivered with its tool calls, no matter how large", () => {
	// one subscriber on the team's own chat room
	const receivedChatMessages: { chatMessageId: number; roomToolCalls: RoomTopicToolCalls }[] = []
	const stopListening = onChatRoomMessage(null, "team-2", (chatMessageId, roomToolCalls) =>
		receivedChatMessages.push({ chatMessageId, roomToolCalls }),
	)

	// large tool calls decode whole
	const roomToolCalls: RoomTopicToolCalls = {
		topicSaves: ["x".repeat(12_000)],
		topicSaveRejections: [],
		proposedToUserId: "user-9",
	}
	deliverChatRoomPayload(
		toChatRoomPayload({
			senderInstanceId: "other-instance",
			topicId: null,
			teamId: "team-2",
			chatMessageId: 8,
			roomToolCalls,
		}),
	)
	expect(receivedChatMessages).toEqual([{ chatMessageId: 8, roomToolCalls }])
	stopListening()
})

// a tool-calls part that does not decode counts as no tool calls, and the chat message still arrives
test("another instance's chat message still arrives if its tool calls do not decode", () => {
	// one subscriber on the topic's chat room
	const receivedChatMessages: { chatMessageId: number; roomToolCalls: RoomTopicToolCalls }[] = []
	const stopListening = onChatRoomMessage("t3", "team-3", (chatMessageId, roomToolCalls) =>
		receivedChatMessages.push({ chatMessageId, roomToolCalls }),
	)

	// a fifth part that is not base64url json
	deliverChatRoomPayload("other-instance:t3:team-3:9:not-json")
	expect(receivedChatMessages).toEqual([{ chatMessageId: 9, roomToolCalls: EMPTY_ROOM_TOPIC_TOOL_CALLS }])
	stopListening()
})

// a payload without tool calls has no fifth part
test("a payload without tool calls is the instance, the chat room, and the chat message id", () => {
	// a topic's chat room, then the team's own chat room
	const chatRoomPayloadOptions = {
		senderInstanceId: "instance-1",
		teamId: "team-1",
		roomToolCalls: EMPTY_ROOM_TOPIC_TOOL_CALLS,
	}
	expect(toChatRoomPayload({ ...chatRoomPayloadOptions, topicId: "t1", chatMessageId: 1 })).toBe(
		"instance-1:t1:team-1:1",
	)
	expect(toChatRoomPayload({ ...chatRoomPayloadOptions, topicId: null, chatMessageId: 2 })).toBe(
		"instance-1:team:team-1:2",
	)
})
