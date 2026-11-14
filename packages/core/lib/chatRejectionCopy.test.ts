// chat rejection copy tests: the error an unverified email's rejection names maps to the one line both apps show, on a
// private chat turn, in a voice notice, and on a chat room post
import { expect, test } from "bun:test"
import { toChatRejection, toChatTurnRejection } from "@carlnotes/client/chatClient"
import {
	CHAT_PAUSED_ERROR,
	CHAT_PAUSED_LINE,
	EMAIL_UNVERIFIED_ERROR,
	EMAIL_UNVERIFIED_LINE,
} from "@carlnotes/contracts/chat"
import { toModelReplyRejection } from "../hooks/useChatRoom"
import { showChatRejectionNotice } from "../stores/voiceNoticeStore"
import { collectVoiceNotices } from "../stores/voiceTestFixtures"
import { CHAT_REJECTION_COPY, CHAT_ROOM_REJECTION_COPY } from "./chatRejectionCopy"

// the line says to verify the email, and names neither spend nor a cutoff
test("the unverified email line is the sentence both apps show", () => {
	expect(EMAIL_UNVERIFIED_LINE).toBe("Carl will answer once your email is verified. Check your inbox.")
})

// the shared notice renders the copy of the rejection a chat turn's status and error map to
test("a chat turn's unverified email rejection maps to the line", () => {
	expect(toChatTurnRejection(403, EMAIL_UNVERIFIED_ERROR)).toBe("emailUnverified")
	expect(CHAT_REJECTION_COPY[toChatTurnRejection(403, EMAIL_UNVERIFIED_ERROR)]).toBe(EMAIL_UNVERIFIED_LINE)

	// any other 403 still reads as forbidden, and the chat cutoff still shows its own line
	expect(toChatRejection(403, "forbidden")).toBe("forbidden")
	expect(toChatRejection(403)).toBe("forbidden")
	expect(CHAT_REJECTION_COPY[toChatRejection(429, CHAT_PAUSED_ERROR)]).toBe(CHAT_PAUSED_LINE)
})

// a rejected transcription shows its rejection's copy as a voice notice
test("a voice request's unverified email rejection shows the line", () => {
	const { notices, unregister } = collectVoiceNotices()

	// the notice is the line alone, with the collected notices unregistered whether or not it is
	try {
		showChatRejectionNotice(toChatRejection(403, EMAIL_UNVERIFIED_ERROR))
		expect(notices).toEqual([EMAIL_UNVERIFIED_LINE])
	} finally {
		unregister()
	}
})

// both apps' chat rooms render the room copy of the rejection a post's reason maps to
test("a chat room post's unverified email rejection maps to the line", () => {
	expect(toModelReplyRejection(EMAIL_UNVERIFIED_ERROR)).toBe("emailUnverified")
	expect(CHAT_ROOM_REJECTION_COPY.emailUnverified).toBe(EMAIL_UNVERIFIED_LINE)

	// the chat cutoff still maps to its own rejection, and any other reason reads as the spent budget
	expect(toModelReplyRejection(CHAT_PAUSED_ERROR)).toBe("chatPaused")
	expect(CHAT_ROOM_REJECTION_COPY.chatPaused).toBe(CHAT_PAUSED_LINE)
	expect(toModelReplyRejection("Carl is staring at an empty mug. Top up to keep chatting.")).toBe("budget")
})
