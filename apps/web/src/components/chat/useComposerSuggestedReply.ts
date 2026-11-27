// the web composer's suggested reply: the shared rule's suggestion, its one polite announcement, Right Arrow in an empty
// box and the accept button accepting it, and the caret left at the end of what was accepted

import type { ChatPage } from "@carlnotes/client/chatClient"
import {
	type SuggestedReplyAcceptMethod,
	toSuggestedReplyCapture,
	useSuggestedReply,
} from "@carlnotes/core/hooks/useSuggestedReply"
import { SUGGESTED_REPLY_COPY } from "@carlnotes/core/lib/chatCopy"
import { type RefObject, useCallback, useRef, useState } from "react"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import type { TopicChat } from "./useTopicChat"
import type { VoiceRecording } from "./useVoiceRecording"

// the conversation, its page, the box's line without a suggestion, the voice recording, and the question box
type UseComposerSuggestedReplyOptions = {
	chat: TopicChat
	// a composer with no page shows no suggestion
	page?: ChatPage
	placeholder: string
	voiceRecording: Pick<VoiceRecording, "state" | "isListening">
	questionBoxRef: RefObject<HTMLTextAreaElement | null>
}

// what the composer renders and calls
export type ComposerSuggestedReply = {
	suggestedReply: string | null
	// the box's own line, empty while the suggestion's one-line overlay shows in its place
	placeholder: string
	announcement: string
	accept: (acceptMethod: Extract<SuggestedReplyAcceptMethod, "arrowKey" | "button">) => void
	handleAcceptKey: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
	moveCaretAfterAccept: (questionBox: HTMLTextAreaElement) => void
}

/**
 * Returns the composer's suggested reply, counted through the visit analytics with no text and announced once.
 */
export function useComposerSuggestedReply({
	chat,
	page,
	placeholder,
	voiceRecording,
	questionBoxRef,
}: UseComposerSuggestedReplyOptions): ComposerSuggestedReply {
	// a recording, a transcript on its way, and listen mode's voice composer show none
	const isComposerBusy = voiceRecording.state !== "idle" || voiceRecording.isListening

	// the shared rule, and the announcement it hands the live region once for each suggestion
	const [announcement, setAnnouncement] = useState("")
	const { suggestedReply, accept } = useSuggestedReply({
		page: page ?? { topicId: "" },
		topicChat: { ...chat, isSuggestedReplyOn: page !== undefined && chat.isSuggestedReplyOn },
		isComposerBusy,
		onSuggestedReplyEvent: (suggestedReplyEvent) => {
			const { name, properties } = toSuggestedReplyCapture(suggestedReplyEvent)
			captureVisitEvent(name, properties)
		},
		onSuggestedReplyShown: (text) => setAnnouncement(SUGGESTED_REPLY_COPY.toAnnouncement(text)),
	})

	// accept into the box and keep focus in it. the caret moves once the box holds the text
	const shouldMoveCaretToEndRef = useRef(false)
	const acceptIntoQuestionBox = (acceptMethod: Extract<SuggestedReplyAcceptMethod, "arrowKey" | "button">): void => {
		shouldMoveCaretToEndRef.current = true
		accept(acceptMethod)
		questionBoxRef.current?.focus()
	}

	// Right Arrow alone in an empty box, outside an input method composition, accepts it
	const handleAcceptKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		if (isSuggestedReplyAcceptKey(event) && suggestedReply && chat.question === "") {
			event.preventDefault()
			acceptIntoQuestionBox("arrowKey")
		}
	}

	// the caret goes to the end of what an accept put in the box, once
	const moveCaretAfterAccept = useCallback((questionBox: HTMLTextAreaElement): void => {
		if (!shouldMoveCaretToEndRef.current) {
			return
		}
		shouldMoveCaretToEndRef.current = false
		questionBox.setSelectionRange(questionBox.value.length, questionBox.value.length)
	}, [])
	return {
		suggestedReply,
		placeholder: suggestedReply ? "" : placeholder,
		announcement,
		accept: acceptIntoQuestionBox,
		handleAcceptKey,
		moveCaretAfterAccept,
	}
}

// Right Arrow with no modifier, outside an input method composition
function isSuggestedReplyAcceptKey(keyPress: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
	const { key, shiftKey, altKey, ctrlKey, metaKey, nativeEvent } = keyPress
	return key === "ArrowRight" && !shiftKey && !altKey && !ctrlKey && !metaKey && !nativeEvent.isComposing
}
