// the chat room's fan-out across instances over Redis pub/sub.
// a stored chat message reaches this instance's subscribers directly and every other instance through the channel
import { EventEmitter } from "node:events"
import type { RoomTopicToolCalls } from "@shared/contracts"
import { publishToChannel, subscribeToChannel } from "../../db/redis"

// the one channel that every instance subscribes to. the payload names the sending instance, the topic, the team,
// and the chat message id. a fifth part holds the chat turn's tool calls if a topic tool left any
export const CHAT_ROOM_CHANNEL = "room_messages"

// this instance's id in each payload, so this instance can skip the echo of its own payload
const instanceId = crypto.randomUUID()

// this instance's subscribers, keyed by topic and team id through the emitter's event names
const chatRoomEvents = new EventEmitter()
chatRoomEvents.setMaxListeners(0)

// the tool calls that a chat message arrives with if no topic tool left any
const EMPTY_ROOM_TOPIC_TOOL_CALLS: RoomTopicToolCalls = { topicSaves: [], topicSaveRejections: [] }

// one chat room: the topic, or null for the team's own chat room, and the team
type ToChatRoomKeyOptions = { topicId: string | null; teamId: string }

// what one payload names: the sending instance, the chat room, the chat message, and what a topic tool left
export type ToChatRoomPayloadOptions = ToChatRoomKeyOptions & {
	senderInstanceId: string
	chatMessageId: number
	roomToolCalls: RoomTopicToolCalls
}

/**
 * Listens on this instance for a chat room's new chat message ids, each with what a topic tool left in that chat turn,
 * and returns the function that stops listening.
 */
export function onChatRoomMessage(
	topicId: string | null,
	teamId: string,
	handler: (chatMessageId: number, roomToolCalls: RoomTopicToolCalls) => void,
): () => void {
	// subscribe this instance to the channel, then register the handler under the chat room's key
	subscribeToChannel(CHAT_ROOM_CHANNEL, deliverChatRoomPayload)
	chatRoomEvents.on(toChatRoomKey({ topicId, teamId }), handler)
	return () => chatRoomEvents.off(toChatRoomKey({ topicId, teamId }), handler)
}

/**
 * Tells every instance that a chat message was stored, with what a topic tool left, after the insert commits.
 * This instance's subscribers get the chat message id first, even if publishing to the channel fails.
 */
export async function notifyChatRoomMessage(
	topicId: string | null,
	teamId: string,
	chatMessageId: number,
	roomToolCalls: RoomTopicToolCalls = EMPTY_ROOM_TOPIC_TOOL_CALLS,
): Promise<void> {
	// deliver to this instance's subscribers, then publish to every other instance
	chatRoomEvents.emit(toChatRoomKey({ topicId, teamId }), chatMessageId, roomToolCalls)
	await publishToChannel({
		channel: CHAT_ROOM_CHANNEL,
		channelMessage: toChatRoomPayload({ senderInstanceId: instanceId, topicId, teamId, chatMessageId, roomToolCalls }),
	})
}

/**
 * Returns the payload that an instance publishes for a stored chat message.
 * The tool calls are JSON encoded as base64url, whose alphabet has no colon to split on.
 */
export function toChatRoomPayload({
	senderInstanceId,
	topicId,
	teamId,
	chatMessageId,
	roomToolCalls,
}: ToChatRoomPayloadOptions): string {
	// join the parts with colons, with the tool calls as a fifth part only if a topic tool left any
	const hasToolCalls =
		roomToolCalls.topicSaves.length > 0 ||
		roomToolCalls.topicSaveRejections.length > 0 ||
		roomToolCalls.proposedToUserId !== undefined ||
		roomToolCalls.isTopicEditCancelled === true
	const toolCallsSuffix = hasToolCalls ? `:${Buffer.from(JSON.stringify(roomToolCalls)).toString("base64url")}` : ""
	return `${senderInstanceId}:${toChatRoomKey({ topicId, teamId })}:${chatMessageId}${toolCallsSuffix}`
}

// re-emit another instance's payload to this instance's subscribers for the payload's chat room
function deliverChatRoomPayload(chatRoomPayload: string): void {
	// the payload is senderInstanceId:topicId:teamId:chatMessageId, plus the tool calls if a topic tool left any
	const [senderInstanceId, topicId, teamId, chatMessageId, toolCallsPart] = chatRoomPayload.split(":")

	// skip the echo of this instance's own payload and a payload missing a part, then emit to the chat room's subscribers
	if (senderInstanceId === instanceId || !topicId || !teamId || !chatMessageId) {
		return
	}
	chatRoomEvents.emit(`${topicId}:${teamId}`, Number(chatMessageId), toRoomTopicToolCalls(toolCallsPart))
}

// a chat room's key in the emitter and the payload. the team's own chat room has "team" in place of a topic id
function toChatRoomKey({ topicId, teamId }: ToChatRoomKeyOptions): string {
	return `${topicId ?? "team"}:${teamId}`
}

// the tool calls in a payload's fifth part, decoded from base64url JSON
function toRoomTopicToolCalls(toolCallsPart: string | undefined): RoomTopicToolCalls {
	// a payload with no fifth part has no tool calls
	if (!toolCallsPart) {
		return EMPTY_ROOM_TOPIC_TOOL_CALLS
	}

	// a fifth part that does not decode counts as no tool calls, so the chat message still arrives
	try {
		return JSON.parse(Buffer.from(toolCallsPart, "base64url").toString()) as RoomTopicToolCalls
	} catch {
		return EMPTY_ROOM_TOPIC_TOOL_CALLS
	}
}
