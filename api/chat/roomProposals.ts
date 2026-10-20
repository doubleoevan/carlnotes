// a topic's team chat room proposals: the change carl previewed for the member who addressed him, stored encrypted for
// that member alone, taken back at that member's next message to carl in the chat room, and applied by the server only
// if that member's own words agree
import { toWordsWithoutModelMention } from "@shared/chatMentions"
import type { ChatToolCall } from "@shared/payloads"
import { proposeTopicEditPayload } from "@shared/topicPayloads"
import { db } from "../../db"
import { chatProposals } from "../../db/schema/chat"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import {
	applyTopicEdit,
	CHAT_PROPOSAL_PAGE_TARGET,
	type ChatProposalResult,
	cancelUnconfirmedProposal,
	NO_PROPOSAL_RESULT,
	resolveChatProposal,
	toChatProposalPageFilter,
	toStandingChatProposal,
} from "./chatProposals"
import { decryptChatJson, encryptChatJson } from "./encryption"

// the member a chat room preview was shown to, and the topic and the team whose chat room it was shown in
type ChatRoomProposalRef = { userId: string; topicId: string; teamId: string }

// the chat room turn whose standing preview is recorded: its chat turn row and the tool calls it made
type RecordChatRoomProposalOptions = ChatRoomProposalRef & { chatTurnId: string; chatToolCalls: ChatToolCall[] }

/**
 * Records the preview a chat room turn leaves standing for the member who addressed carl, encrypted.
 */
export async function recordChatRoomProposal({
	userId,
	topicId,
	teamId,
	chatTurnId,
	chatToolCalls,
}: RecordChatRoomProposalOptions): Promise<void> {
	// find the preview the turn leaves standing, and record nothing if none stands
	const chatProposal = toStandingChatProposal({ page: { topicId }, chatToolCalls })
	if (chatProposal?.kind !== "topicEdit") {
		return
	}

	// one row per member per topic's team chat room, replaced by the newest preview
	const encryptedTopicEdit = encryptChatJson(chatProposal.topicEdit)
	await db
		.insert(chatProposals)
		.values({ userId, topicId, teamId, chatTurnId, topicEdit: encryptedTopicEdit })
		.onConflictDoUpdate({
			target: CHAT_PROPOSAL_PAGE_TARGET,
			set: { chatTurnId, topicEdit: encryptedTopicEdit, createdAt: new Date() },
		})
}

// the member's message that may answer their preview, what the saves record, and the key the agreement check bills
type AnswerChatRoomProposalOptions = ChatRoomProposalRef & {
	question: string
	toolCalls: ChatTurnToolCalls
	litellmApiKey?: string
}

/**
 * Takes the preview standing for this member in this topic's team chat room, and applies it under their rights if their
 * own words agree.
 */
export async function answerChatRoomProposal({
	userId,
	topicId,
	teamId,
	question,
	toolCalls,
	litellmApiKey,
}: AnswerChatRoomProposalOptions): Promise<ChatProposalResult> {
	// take the member's waiting preview, and stop if none was waiting
	const storedTopicEdit = await takeChatRoomProposal({ userId, topicId, teamId })
	if (storedTopicEdit === null) {
		return NO_PROPOSAL_RESULT
	}

	// read the preview back, and apply nothing if it does not decrypt or no longer reads as an edit
	const topicEditResult = proposeTopicEditPayload.safeParse(decryptChatJson(storedTopicEdit))
	if (!topicEditResult.success) {
		return cancelUnconfirmedProposal(toolCalls, { topicId })
	}

	// read only the member's own words against the preview, then act on the decision
	return resolveChatProposal({
		page: { topicId },
		chatProposal: { kind: "topicEdit", topicEdit: topicEditResult.data },
		question: toWordsWithoutModelMention(question),
		toolCalls,
		litellmApiKey,
		applyProposal: () => applyTopicEdit({ userId, topicId, toolCalls }, topicEditResult.data),
	})
}

// take the member's waiting chat room preview and delete it, returning its encrypted topic edit, or null if none was
// waiting
async function takeChatRoomProposal({ userId, topicId, teamId }: ChatRoomProposalRef): Promise<string | null> {
	const [takenChatProposal] = await db
		.delete(chatProposals)
		.where(toChatProposalPageFilter({ userId, topicId, teamId }))
		.returning({ topicEdit: chatProposals.topicEdit })
	return takenChatProposal?.topicEdit ?? null
}
