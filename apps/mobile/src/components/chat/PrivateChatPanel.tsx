import type { ChatPage } from "@carlnotes/client/chatClient"
import { CHAT_HISTORY_TURNS, toUncompactedChatTurnStart } from "@carlnotes/contracts/chat"
import type { ChatMessageAuthor } from "@carlnotes/core/components/ChatTurnBlock"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { useTopicChat } from "@carlnotes/core/hooks/useTopicChat"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import type { ChatTurn } from "@carlnotes/core/lib/chatTurns"
import { clearProposedTopicEdit } from "@carlnotes/core/stores/chatConversationStore"
import { useEffect, useRef } from "react"
import { Alert, type FlatList, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useIsScreenActive } from "@/hooks/useIsScreenActive"
import { ChatComposer } from "./ChatComposer"
import { ChatMessageList } from "./ChatMessageList"
import { ChatOptionsMenu } from "./ChatOptionsMenu"
import { ChatRejectionNotice } from "./ChatRejectionNotice"
import { ChatTurnBlock } from "./ChatTurnBlock"
import { TopicDraftCard } from "./TopicDraftCard"

/**
 * Uses the web conversation state, with native cancellation and authoritative history on return.
 */
export function PrivateChatPanel({
	page,
	name: chatName,
	author,
}: {
	page: ChatPage
	name: string
	author: ChatMessageAuthor
}) {
	// use the shared conversation with native notices and text-only effects
	const topicChat = useTopicChat({
		page,
		effects: {
			onNotice: (message) => Alert.alert("Coffee Talk", message),
			openNewTopicChat: () => Alert.alert("Coffee Talk", "New-topic chat is available on the web."),
		},
	})
	const topicChatRef = useRef(topicChat)
	topicChatRef.current = topicChat
	const isActive = useIsScreenActive()
	const hasBeenActiveRef = useRef(false)
	const listRef = useRef<FlatList<ChatTurn>>(null)
	const now = useNow()

	// stop background requests and read authoritative history on return
	useEffect(() => {
		if (isActive) {
			if (hasBeenActiveRef.current) {
				topicChatRef.current.reload()
			}
			hasBeenActiveRef.current = true
		} else {
			topicChatRef.current.stop()
		}
		return () => topicChatRef.current.stop()
	}, [isActive])

	// retain the shared history boundary and gate before rendering the composer
	const chatHistoryStart = Math.max(0, topicChat.chatTurns.length - CHAT_HISTORY_TURNS)
	const uncompactedChatTurnStart =
		chatHistoryStart + toUncompactedChatTurnStart(topicChat.chatTurns.slice(-CHAT_HISTORY_TURNS))
	if (topicChat.hasLoadFailed) {
		return (
			<View className="gap-3 p-3">
				<Text>Carl could not open this conversation.</Text>
				<Button accessibilityLabel="Retry conversation" onPress={topicChat.reload}>
					<Text>Try again</Text>
				</Button>
			</View>
		)
	}
	if (!topicChat.isLoaded) {
		return <CoffeeLoading />
	}
	if (!topicChat.canChat && !topicChat.isBudgetExhausted) {
		return <Text className="p-3 text-muted-foreground">{CHAT_REJECTION_COPY.forbidden}</Text>
	}
	return (
		<View className="flex-1">
			{/* conversation actions */}
			<View className="flex-row justify-end">
				<ChatOptionsMenu onClear={topicChat.clear} isDisabled={!topicChat.chatTurns.length || topicChat.isStreaming} />
			</View>
			{/* chat turns */}
			<ChatMessageList
				data={topicChat.chatTurns}
				listRef={listRef}
				keyExtractor={(chatTurn) => chatTurn.spokenAnswerKey}
				emptyText={topicChat.isBudgetExhausted ? "" : `Ask me for a hot take on ${chatName || "this chat"}.`}
				renderItem={(chatTurn, index) => (
					<ChatTurnBlock
						chatTurn={chatTurn}
						index={index}
						uncompactedChatTurnStart={uncompactedChatTurnStart}
						isLast={index === topicChat.chatTurns.length - 1}
						isStreaming={topicChat.isStreaming}
						now={now}
						author={author}
						voiceChatPage={null}
						onRetry={(question) => void topicChat.send(question)}
					/>
				)}
			/>
			{/* topic draft */}
			{topicChat.editableTopicDraft && (
				<TopicDraftCard
					{...topicChat.editableTopicDraft}
					topicId={page.topicId}
					isCarlReplying={topicChat.isStreaming}
					onDismissTopicEdit={clearProposedTopicEdit}
				/>
			)}
			{/* budget and composer */}
			{topicChat.isBudgetExhausted ? (
				<View className="p-3">
					<ChatRejectionNotice rejection="budget" />
				</View>
			) : (
				<ChatComposer
					value={topicChat.question}
					onChange={topicChat.setQuestion}
					onSend={() => void topicChat.send()}
					onStop={topicChat.stop}
					isStreaming={topicChat.isStreaming}
					isDisabled={!isActive || !topicChat.canChat}
				/>
			)}
		</View>
	)
}
