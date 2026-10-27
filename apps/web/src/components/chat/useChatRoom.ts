import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { type ChatRoomState, useChatRoom as useSharedChatRoom } from "@carlnotes/core/hooks/useChatRoom"
import { useMemo } from "react"
import { toast } from "sonner"
import { useChatRoomSpokenAnswer } from "./useChatRoomSpokenAnswer"
import { useChatRoomStream } from "./useChatRoomStream"

export {
	type ChatRoomPost,
	type ChatRoomRejection,
	type ChatRoomState,
	FIRST_ITEM_INDEX_START,
} from "@carlnotes/core/hooks/useChatRoom"

/**
 * Adds browser speech and streaming to shared room state.
 */
export function useChatRoom({
	topicId,
	teamId,
	userId,
}: {
	topicId: string | null
	teamId: string
	userId: string | undefined
}): ChatRoomState {
	// attach browser speech and streaming to the room
	const voiceChatPage = useMemo<VoiceChatPage>(() => ({ kind: "room", topicId, teamId }), [topicId, teamId])
	const chatRoomSpokenAnswer = useChatRoomSpokenAnswer(voiceChatPage)
	return useSharedChatRoom({
		topicId,
		teamId,
		userId,
		useStream: useChatRoomStream,
		onNotice: toast,
		...chatRoomSpokenAnswer,
	})
}
