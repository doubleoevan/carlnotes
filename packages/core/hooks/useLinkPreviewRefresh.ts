// the background polling that fills each finished chat turn's link preview cards

import { type ChatPage, fetchChatConversation } from "@carlnotes/client/chatClient"
import type { ChatTurnRow } from "@carlnotes/contracts/chat"
import { useEffect, useRef } from "react"
import { hasPreviewableLink } from "../lib/chatLinkPreviews"
import { type ChatTurn, findChatTurn, replaceChatTurn } from "../lib/chatTurns"
import { toCurrentChatGuard } from "../stores/chatConversationStore"

// how long a finished chat turn waits before it looks for its link preview cards again
const LINK_PREVIEW_REFRESH_MS = 2500

// how many refreshes a chat turn gets before it stops waiting on its cards
const LINK_PREVIEW_REFRESH_ATTEMPTS = 6

/**
 * Polls in the background for each finished chat turn's link preview cards, giving each one a few attempts. Returns a
 * function that starts the poll for the chat turn with a spoken answer key, if its text held a link.
 */
export function useLinkPreviewRefresh(
	chatPage: ChatPage,
	setChatTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>,
): (spokenAnswerKey: string) => void {
	// the refreshes left for each chat turn waiting on its cards, and the one timer that schedules them
	const isMountedRef = useRef(true)
	const generationRef = useRef(0)
	const linkPreviewAttemptsRef = useRef(new Map<string, number>())
	const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// one refresh: read the conversation again and land each pending chat turn's cards that are ready
	const refreshLinkPreviews = async (): Promise<void> => {
		linkPreviewTimerRef.current = null
		const isCurrentChat = toCurrentChatGuard()
		const generation = generationRef.current

		// read the conversation back from the server, spending one attempt of every pending chat turn
		const chatConversation = await fetchChatConversation(chatPage).catch(() => null)
		if (!isMountedRef.current || generation !== generationRef.current || !isCurrentChat()) {
			return
		}
		const linkPreviewAttempts = linkPreviewAttemptsRef.current
		for (const [spokenAnswerKey, linkPreviewAttemptsLeft] of linkPreviewAttempts) {
			linkPreviewAttempts.set(spokenAnswerKey, linkPreviewAttemptsLeft - 1)
		}

		// each chat turn still marked pending takes the server's cards
		setChatTurns((chatTurns) => {
			const linkPreviewRefresh = toLinkPreviewRefresh({
				chatTurns,
				linkPreviewAttempts,
				serverChatTurns: chatConversation?.chatTurns ?? [],
			})

			// a chat turn done waiting leaves the poll
			for (const spokenAnswerKey of linkPreviewRefresh.settledSpokenAnswerKeys) {
				linkPreviewAttempts.delete(spokenAnswerKey)
			}

			// a chat turn still pending goes back on the timer
			if (linkPreviewAttempts.size > 0) {
				scheduleLinkPreviewRefresh()
			}
			return linkPreviewRefresh.chatTurns
		})
	}

	// the one timer, started only when nothing is already waiting
	const scheduleLinkPreviewRefresh = (): void => {
		if (!isMountedRef.current) {
			return
		}
		linkPreviewTimerRef.current ??= setTimeout(() => void refreshLinkPreviews(), LINK_PREVIEW_REFRESH_MS)
	}

	// leaving the conversation clears the pending refresh timer
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
			generationRef.current += 1
			linkPreviewAttemptsRef.current.clear()
			if (linkPreviewTimerRef.current) {
				clearTimeout(linkPreviewTimerRef.current)
				linkPreviewTimerRef.current = null
			}
		}
	}, [])

	// a completed chat turn that mentioned a link loads until its cards land
	return (spokenAnswerKey: string): void => {
		setChatTurns((chatTurns) => {
			// a missing or rejected chat turn waits on no link preview
			const finishedChatTurn = findChatTurn(chatTurns, spokenAnswerKey)
			if (!finishedChatTurn || finishedChatTurn.rejection !== null) {
				return chatTurns
			}
			if (!hasPreviewableLink(finishedChatTurn.question) && !hasPreviewableLink(finishedChatTurn.answer)) {
				return chatTurns
			}

			// a link is worth polling for, so the chat turn shows its card as pending until one arrives
			linkPreviewAttemptsRef.current.set(spokenAnswerKey, LINK_PREVIEW_REFRESH_ATTEMPTS)
			scheduleLinkPreviewRefresh()
			return replaceChatTurn(chatTurns, spokenAnswerKey, (chatTurn) => ({ ...chatTurn, linkPreviewsPending: true }))
		})
	}
}

// the chat turns, the refreshes left for each pending one, and the conversation the server returned
type ToLinkPreviewRefreshOptions = {
	chatTurns: ChatTurn[]
	linkPreviewAttempts: ReadonlyMap<string, number>
	serverChatTurns: ChatTurnRow[]
}

/**
 * Returns the chat turns with each pending one refreshed from the server's chat turn that asked its question, and the
 * spoken answer keys that are done waiting: their cards landed, their attempts ran out, or they are no longer pending.
 */
export function toLinkPreviewRefresh({
	chatTurns,
	linkPreviewAttempts,
	serverChatTurns,
}: ToLinkPreviewRefreshOptions): {
	chatTurns: ChatTurn[]
	settledSpokenAnswerKeys: string[]
} {
	// each pending chat turn is refreshed on its own, so a newer chat turn never strands an older one's cards
	let refreshedChatTurns = chatTurns
	const settledSpokenAnswerKeys: string[] = []
	for (const [spokenAnswerKey, linkPreviewAttemptsLeft] of linkPreviewAttempts) {
		// a chat turn that is gone or no longer pending stops waiting
		const pendingChatTurn = findChatTurn(refreshedChatTurns, spokenAnswerKey)
		if (!pendingChatTurn?.linkPreviewsPending) {
			settledSpokenAnswerKeys.push(spokenAnswerKey)
			continue
		}

		// the server's newest chat turn that asked the same question gives its cards
		const serverChatTurn = serverChatTurns.findLast((chatTurn) => chatTurn.question === pendingChatTurn.question)
		const refreshedChatTurn = toRefreshedChatTurn(pendingChatTurn, serverChatTurn, linkPreviewAttemptsLeft)

		// a chat turn whose cards landed or whose attempts ran out is done waiting
		if (!refreshedChatTurn.linkPreviewsPending) {
			settledSpokenAnswerKeys.push(spokenAnswerKey)
		}
		refreshedChatTurns = replaceChatTurn(refreshedChatTurns, spokenAnswerKey, () => refreshedChatTurn)
	}
	return { chatTurns: refreshedChatTurns, settledSpokenAnswerKeys }
}

// the pending chat turn with whatever cards the server's chat turn with its question holds. loading ends when every
// chat turn with a link has a card or the attempts run out
function toRefreshedChatTurn(
	pendingChatTurn: ChatTurn,
	serverChatTurn: ChatTurnRow | undefined,
	linkPreviewAttemptsLeft: number,
): ChatTurn {
	// the server's cards if it has the chat turn, else the ones the pending chat turn already shows
	const linkPreviews = serverChatTurn?.linkPreviews ?? pendingChatTurn.linkPreviews
	const answerLinkPreviews = serverChatTurn?.answerLinkPreviews ?? pendingChatTurn.answerLinkPreviews

	// a chat turn without a link needs no card of its own
	const isQuestionDone = !hasPreviewableLink(pendingChatTurn.question) || linkPreviews.length > 0
	const isAnswerDone = !hasPreviewableLink(pendingChatTurn.answer) || answerLinkPreviews.length > 0
	const isChatTurnDone = (isQuestionDone && isAnswerDone) || linkPreviewAttemptsLeft <= 0
	return { ...pendingChatTurn, linkPreviews, answerLinkPreviews, linkPreviewsPending: !isChatTurnDone }
}
