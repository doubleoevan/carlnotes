// share conversation rules with every client
export {
	type ChatTurn,
	findChatTurn,
	replaceChatTurn,
	toFinishedChatTurns,
	toKeptAttachmentPlaceholders,
	toLoadedChatTurn,
	toSentChatTurn,
	toSpokenAnswerKey,
	upsertChatTurn,
	withoutChatTurn,
} from "@carlnotes/core/lib/chatTurns"
