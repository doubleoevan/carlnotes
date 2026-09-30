// writing a chat reply onto its response stream: each text part as it arrives, and the tool calls as each tool returns
import { type ChatToolCall, type TopicToolCalls, toChatReplyLineText } from "@shared/contracts"
import type { ChatReplyStream } from "../../worker"
import type { ChatTurnToolCalls } from "../tool/chatTools"

// the response stream that a reply's lines are written to
type ReplyWriteStream = { write: (text: string) => Promise<unknown> }

/**
 * Forwards each text part as it arrives, and any tool calls not yet sent to the api client each time a tool returns.
 */
export async function writeReplyStream(
	writeStream: ReplyWriteStream,
	reply: Pick<ChatReplyStream, "replyParts">,
	toolCalls: ChatTurnToolCalls,
): Promise<void> {
	const sentToolCalls: SentToolCalls = {
		topicSaveCount: 0,
		topicSaveRejectionCount: 0,
		chatToolCallCount: 0,
		isCreatedTopicSent: false,
		isNewTopicChatSent: false,
		isTopicEditCancelledSent: false,
	}
	// collect the tool calls in the order they returned
	const chatToolCalls: ChatToolCall[] = []
	// forward each text part and write any tool calls not yet sent to the api client when a tool returns
	for await (const replyPart of reply.replyParts) {
		if (replyPart.type === "text") {
			await writeStream.write(toChatReplyLineText({ type: "text", text: replyPart.text }))
			continue
		}
		chatToolCalls.push(replyPart.toolCall)
		await writeUnsentToolCalls(writeStream, toolCalls, chatToolCalls, sentToolCalls)
	}
	// write once more, so a tool call that finished after the last text part still reaches the api client
	await writeUnsentToolCalls(writeStream, toolCalls, chatToolCalls, sentToolCalls)
}

// the tool calls sent to the api client so far
type SentToolCalls = {
	// how much of each list the api client already has
	topicSaveCount: number
	topicSaveRejectionCount: number
	chatToolCallCount: number
	// the tool calls that are sent only once
	isCreatedTopicSent: boolean
	isNewTopicChatSent: boolean
	isTopicEditCancelledSent: boolean
	// the topic draft and the proposed edit, compared by their json, so carl rewriting one sends it again
	topicDraftJson?: string
	proposedTopicEditJson?: string
}

// write the tool calls not yet sent to the api client and count them as sent
async function writeUnsentToolCalls(
	writeStream: ReplyWriteStream,
	toolCalls: ChatTurnToolCalls,
	chatToolCalls: ChatToolCall[],
	sentToolCalls: SentToolCalls,
): Promise<void> {
	const unsentToolCalls = toUnsentToolCalls(toolCalls, chatToolCalls, sentToolCalls)
	if (!unsentToolCalls) {
		return
	}
	// read the topic draft and the proposed edit as json before the write. a tool may rewrite either one during it
	const writtenTopicDraftJson = unsentToolCalls.topicDraft ? JSON.stringify(unsentToolCalls.topicDraft) : undefined
	const writtenProposedTopicEditJson = unsentToolCalls.proposedTopicEdit
		? JSON.stringify(unsentToolCalls.proposedTopicEdit)
		: undefined
	await writeStream.write(toChatReplyLineText({ type: "toolCalls", toolCalls: unsentToolCalls }))
	// count only what was just written as sent. a tool call that finished during the write is sent with the next line
	sentToolCalls.topicSaveCount += unsentToolCalls.topicSaves.length
	sentToolCalls.topicSaveRejectionCount += unsentToolCalls.topicSaveRejections.length
	sentToolCalls.chatToolCallCount += unsentToolCalls.chatToolCalls?.length ?? 0
	// mark the topic draft as sent until it changes, and the created topic once
	if (writtenTopicDraftJson) {
		sentToolCalls.topicDraftJson = writtenTopicDraftJson
	}
	if (unsentToolCalls.createdTopicId) {
		sentToolCalls.isCreatedTopicSent = true
	}
	// mark the opened new-topic chat as sent once
	if (unsentToolCalls.isNewTopicChatOpened) {
		sentToolCalls.isNewTopicChatSent = true
	}
	// mark the cancelled edit as sent once
	if (unsentToolCalls.isTopicEditCancelled) {
		sentToolCalls.isTopicEditCancelledSent = true
	}
	// mark the proposed edit as sent until carl revises it
	if (writtenProposedTopicEditJson) {
		sentToolCalls.proposedTopicEditJson = writtenProposedTopicEditJson
	}
}

// the tool calls not yet sent to the api client, or null if there are none
function toUnsentToolCalls(
	toolCalls: ChatTurnToolCalls,
	chatToolCalls: ChatToolCall[],
	sentToolCalls: SentToolCalls,
): TopicToolCalls | null {
	const topicSaves = toolCalls.topicSaves.slice(sentToolCalls.topicSaveCount)
	const topicSaveRejections = toolCalls.topicSaveRejections.slice(sentToolCalls.topicSaveRejectionCount)
	const unsentChatToolCalls = chatToolCalls.slice(sentToolCalls.chatToolCallCount)
	// a topic draft and a proposed edit are sent again whenever carl rewrites them, so both are compared by their json
	const topicDraftJson = toolCalls.topicDraft ? JSON.stringify(toolCalls.topicDraft) : undefined
	const topicDraft = topicDraftJson !== sentToolCalls.topicDraftJson ? toolCalls.topicDraft : undefined
	// the created topic, the opened new-topic chat, and a cancelled edit are each sent once
	const createdTopicId = sentToolCalls.isCreatedTopicSent ? undefined : toolCalls.createdTopicId
	const isNewTopicChatOpened = !sentToolCalls.isNewTopicChatSent && toolCalls.isNewTopicChatOpened ? true : undefined
	const isTopicEditCancelled =
		!sentToolCalls.isTopicEditCancelledSent && toolCalls.isTopicEditCancelled ? true : undefined
	const proposedTopicEditJson = toolCalls.proposedTopicEdit ? JSON.stringify(toolCalls.proposedTopicEdit) : undefined
	const proposedTopicEdit =
		proposedTopicEditJson !== sentToolCalls.proposedTopicEditJson ? toolCalls.proposedTopicEdit : undefined
	// whether every tool call has already been sent
	const isEveryToolCallSent =
		topicSaves.length === 0 &&
		topicSaveRejections.length === 0 &&
		unsentChatToolCalls.length === 0 &&
		// and no topic draft, created topic, opened new-topic chat, proposed edit, or cancelled edit is waiting
		!topicDraft &&
		!createdTopicId &&
		!isNewTopicChatOpened &&
		!proposedTopicEdit &&
		!isTopicEditCancelled
	if (isEveryToolCallSent) {
		return null
	}
	// return only what is new, so the api client applies each tool call once
	return {
		topicSaves,
		topicSaveRejections,
		topicDraft,
		createdTopicId,
		isNewTopicChatOpened,
		proposedTopicEdit,
		isTopicEditCancelled,
		chatToolCalls: unsentChatToolCalls.length > 0 ? unsentChatToolCalls : undefined,
	}
}
