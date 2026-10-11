// the background polling that fills a finished chat turn's link preview cards
import { useEffect, useRef } from "react"
import { type ChatPage, fetchChatConversation } from "@/clients/chatClient"
import { type ChatTurn, replaceNewestChatTurn } from "@/components/chat/chatTurns"
import { hasPreviewableLink } from "@/components/common/LinkPreviewCard"

// how long a finished chat turn waits before it looks for its link preview cards again
const LINK_PREVIEW_REFRESH_MS = 2500

/**
 * Polls in the background for the newest chat turn's link preview cards, giving up after a few attempts. Returns a
 * function that starts the poll, called after a finished chat turn whose text held a link.
 */
export function useLinkPreviewRefresh(
	chatPage: ChatPage,
	setChatTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>,
): () => void {
	// how many background refreshes remain, and the timer that schedules them
	const linkPreviewAttemptsRef = useRef(0)
	const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// one refresh: read the conversation again and land the newest chat turn's cards when they are ready
	const refreshLinkPreview = async (): Promise<void> => {
		linkPreviewTimerRef.current = null

		// read the newest chat turn back from the server, spending one of the attempts
		const chatConversation = await fetchChatConversation(chatPage).catch(() => null)
		const serverChatTurn = chatConversation?.chatTurns.at(-1)
		linkPreviewAttemptsRef.current -= 1
		const linkPreviewAttemptsLeft = linkPreviewAttemptsRef.current

		// only a chat turn still marked pending takes the answer
		setChatTurns((chatTurns) => {
			const newestChatTurn = chatTurns.at(-1)
			if (!newestChatTurn?.linkPreviewsPending) {
				return chatTurns
			}

			// a chat turn still pending after this attempt goes back on the timer
			const refreshedChatTurn = toRefreshedChatTurn(newestChatTurn, serverChatTurn, linkPreviewAttemptsLeft)
			if (refreshedChatTurn.linkPreviewsPending) {
				scheduleLinkPreviewRefresh()
			}
			return replaceNewestChatTurn(chatTurns, () => refreshedChatTurn)
		})
	}

	// the one timer, started only when nothing is already waiting
	const scheduleLinkPreviewRefresh = (): void => {
		linkPreviewTimerRef.current ??= setTimeout(() => void refreshLinkPreview(), LINK_PREVIEW_REFRESH_MS)
	}

	// leaving the conversation clears the pending refresh timer
	useEffect(() => {
		return () => {
			if (linkPreviewTimerRef.current) {
				clearTimeout(linkPreviewTimerRef.current)
			}
		}
	}, [])

	// a completed chat turn that mentioned a link loads until its cards land
	return (): void => {
		setChatTurns((chatTurns) => {
			// only the newest chat turn can still be waiting on a link preview. a rejected turn doesn't
			const newestChatTurn = chatTurns.at(-1)
			if (!newestChatTurn || newestChatTurn.rejection !== null) {
				return chatTurns
			}
			if (!hasPreviewableLink(newestChatTurn.question) && !hasPreviewableLink(newestChatTurn.answer)) {
				return chatTurns
			}

			// a link is worth polling for, so the chat turn shows its card as pending until one arrives
			linkPreviewAttemptsRef.current = 6
			scheduleLinkPreviewRefresh()
			return replaceNewestChatTurn(chatTurns, (chatTurn) => ({ ...chatTurn, linkPreviewsPending: true }))
		})
	}
}

// the newest chat turn with whatever cards the server holds for it. loading ends when every chat turn with a link
// has a card or the attempts run out
function toRefreshedChatTurn(
	newestChatTurn: ChatTurn,
	serverChatTurn:
		| { question: string; linkPreviews: ChatTurn["linkPreviews"]; answerLinkPreviews: ChatTurn["answerLinkPreviews"] }
		| undefined,
	attemptsLeft: number,
): ChatTurn {
	// the newest server chat turn is this one when its stored question matches
	const isSameChatTurn = serverChatTurn !== undefined && serverChatTurn.question === newestChatTurn.question
	const linkPreviews = isSameChatTurn ? serverChatTurn.linkPreviews : newestChatTurn.linkPreviews
	const answerLinkPreviews = isSameChatTurn ? serverChatTurn.answerLinkPreviews : newestChatTurn.answerLinkPreviews

	// a chat turn without a link needs no card of its own
	const isQuestionDone = !hasPreviewableLink(newestChatTurn.question) || linkPreviews.length > 0
	const isAnswerDone = !hasPreviewableLink(newestChatTurn.answer) || answerLinkPreviews.length > 0
	const isChatTurnDone = (isQuestionDone && isAnswerDone) || attemptsLeft <= 0
	return { ...newestChatTurn, linkPreviews, answerLinkPreviews, linkPreviewsPending: !isChatTurnDone }
}
