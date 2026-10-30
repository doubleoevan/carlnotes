import { sendChatMentionsViewed, sendClearChatRoom } from "@carlnotes/client/chatRoomClient"
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { type ChatRoomState, useChatRoom } from "@carlnotes/core/hooks/useChatRoom"
import { useEditableTopicDraft } from "@carlnotes/core/hooks/useEditableTopicDraft"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { useRoomMembers } from "@carlnotes/core/hooks/useRoomMembers"
import { type ChatRoomReply, useRoomReply } from "@carlnotes/core/hooks/useRoomReply"
import { toEmptyChatRoomCopy, toReportedChatMessageLabel } from "@carlnotes/core/lib/chatCopy"
import { CHAT_ROOM_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import { deleteChatRoomMessage } from "@carlnotes/core/lib/chatRoomActions"
import { toChatMessageQuotes } from "@carlnotes/core/lib/chatRoomMessages"
import { clearProposedTopicEdit, toCurrentChatGuard } from "@carlnotes/core/stores/chatConversationStore"
import { markChatRoomOpened } from "@carlnotes/core/stores/chatRoomStore"
import { useEffect, useMemo, useRef, useState } from "react"
import { Alert, type FlatList, ScrollView, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { offerPushPermission } from "@/pushPermission"
import { ChatMessageList } from "./ChatMessageList"
import { ModelThinkingBubble } from "./ChatMessageParts"
import { ChatOptionsMenu } from "./ChatOptionsMenu"
import { ChatRejectionNotice } from "./ChatRejectionNotice"
import { ChatRoomComposer } from "./ChatRoomComposer"
import { ChatRoomMessageBubble } from "./ChatRoomMessageBubble"
import { TopicDraftCard } from "./TopicDraftCard"
import { useChatRoomStream } from "./useChatRoomStream"

/**
 * Wires the shared room state to native messages, member controls and Topic proposals.
 */
export function ChatRoomPanel({
	topicId,
	teamId,
	userId,
	name: chatName,
	isAdmin,
	loadedTeam,
}: {
	topicId: string | null
	teamId: string
	userId: string
	name: string
	isAdmin: boolean
	loadedTeam?: TeamPageResponse
}) {
	// connect room messages, membership and the current Topic preview
	const chatRoom = useChatRoom({
		topicId,
		teamId,
		userId,
		useStream: useChatRoomStream,
		onNotice: (chatMessage) => Alert.alert("Coffee Talk", chatMessage),
	})
	const { memberUsernames, isTeamLeader } = useRoomMembers(teamId, userId, loadedTeam)
	const chatRoomReply = useRoomReply(chatRoom, userId)
	const editableTopicDraft = useEditableTopicDraft(topicId)

	// offer the notification sheet on a room visit
	useEffect(() => {
		void offerPushPermission()
	}, [])

	// acknowledge mentions only for the room that opened successfully
	useEffect(() => {
		if (!chatRoom.isLoaded || chatRoom.isRejected) {
			return
		}
		markChatRoomOpened(topicId, teamId)
		void sendChatMentionsViewed(topicId, teamId).catch(() => {})
	}, [topicId, teamId, chatRoom.isLoaded, chatRoom.isRejected])

	// share accepted refresh, failed deletion, and retired-conversation behavior with web
	const handleDeleteChatMessage = (chatMessageId: number): Promise<void> =>
		deleteChatRoomMessage({
			topicId,
			teamId,
			chatMessageId,
			onReload: chatRoom.reloadChatMessages,
			onNotice: (message) => Alert.alert(message),
		})

	// reload accepted clears before the menu reports success
	const handleClearChatRoom = async (): Promise<boolean> => {
		const isCurrentChat = toCurrentChatGuard()
		const isChatRoomCleared = await sendClearChatRoom(topicId, teamId)
		if (isChatRoomCleared && isCurrentChat()) {
			await chatRoom.reloadChatMessages()
		}
		return isChatRoomCleared
	}
	return (
		<ChatRoomContent
			room={chatRoom}
			reply={chatRoomReply}
			draft={editableTopicDraft}
			topicId={topicId}
			teamId={teamId}
			userId={userId}
			name={chatName}
			canModerate={isTeamLeader || isAdmin}
			memberUsernames={memberUsernames}
			onDelete={handleDeleteChatMessage}
			onClear={handleClearChatRoom}
		/>
	)
}

/**
 * Renders room states with the same message and action composition used by the connected panel.
 */
export function ChatRoomContent({
	room: chatRoom,
	reply: chatRoomReply,
	draft: editableTopicDraft,
	topicId,
	teamId,
	userId,
	name: chatName,
	canModerate,
	memberUsernames,
	onDelete: onDeleteChatMessage,
	onClear,
}: {
	room: ChatRoomState
	reply: ChatRoomReply
	draft: ReturnType<typeof useEditableTopicDraft>
	topicId: string | null
	teamId: string
	userId: string
	name: string
	canModerate: boolean
	memberUsernames: string[]
	onDelete: (chatMessageId: number) => Promise<void>
	onClear: () => Promise<boolean>
}) {
	// keep virtual list and clock state local to the rendered room
	const listRef = useRef<FlatList<ChatRoomMessage>>(null)
	const [scrollTarget, setScrollTarget] = useState<{ key: string }>()
	const now = useNow()
	// the chat message whose report sheet is open, which can block its author
	const [reportedChatMessage, setReportedChatMessage] = useState<ChatRoomMessage | null>(null)
	const chatMessageQuotes = useMemo(() => toChatMessageQuotes(chatRoom.chatMessages), [chatRoom.chatMessages])
	if (chatRoom.isRejected) {
		return <Text className="p-3 text-muted-foreground">Join this team to start the conversation</Text>
	}
	if (!chatRoom.isLoaded && chatRoom.reloadUnreadableRoom) {
		return (
			<LoadFailedNotice
				className="p-3"
				message="This room couldn't load."
				retryLabel="Retry loading room"
				onRetry={chatRoom.reloadUnreadableRoom}
			/>
		)
	}
	if (!chatRoom.isLoaded) {
		return chatRoom.hasLoadFailed ? (
			<Text accessibilityRole="alert" className="p-3 text-muted-foreground">
				This room could not load. Reconnecting…
			</Text>
		) : (
			<CoffeeLoading />
		)
	}
	return (
		<View className="w-full flex-1">
			{/* room actions */}
			{canModerate && (
				<View className="flex-row justify-end">
					<ChatOptionsMenu isRoom isDisabled={!chatRoom.chatMessages.length} onClear={onClear} />
				</View>
			)}
			{/* failed refresh */}
			{chatRoom.hasMessagePageLoadFailed && (
				<LoadFailedNotice
					className="p-3"
					message="This room couldn't refresh. The messages below may be behind."
					retryLabel="Retry refreshing room"
					onRetry={() => void chatRoom.reloadChatMessages()}
				/>
			)}
			{/* messages */}
			<ChatMessageList
				data={chatRoom.chatMessages}
				listRef={listRef}
				scrollTarget={scrollTarget}
				keyExtractor={(chatMessage) => String(chatMessage.id)}
				emptyText={toEmptyChatRoomCopy(chatName)}
				header={
					chatRoom.hasEarlierChatMessages ? (
						<Button
							variant="ghost"
							accessibilityLabel="Load earlier messages"
							onPress={() => void chatRoom.loadEarlierChatMessages()}
						>
							<Text>Earlier messages</Text>
						</Button>
					) : undefined
				}
				footer={
					chatRoom.isMessageLoading ? (
						<View className="p-3">
							<ModelThinkingBubble />
						</View>
					) : undefined
				}
				renderItem={(chatMessage) => (
					<ChatRoomMessageBubble
						chatMessage={chatMessage}
						topicId={topicId}
						teamId={teamId}
						repliedChatMessage={chatMessageQuotes.get(chatMessage.id)}
						isOwnChatMessage={chatMessage.authorUserId === userId}
						now={now}
						canDelete={chatMessage.authorUserId === userId || canModerate}
						isLinkPreviewLoading={chatRoom.loadingChatMessageIds.has(chatMessage.id)}
						voiceChatPage={null}
						onReply={chatRoomReply.selectChatMessage}
						onQuoteClick={(chatMessageId) => setScrollTarget({ key: String(chatMessageId) })}
						onAttachmentDelete={() => {}}
						onDeleteChatMessage={(chatMessageId) => void onDeleteChatMessage(chatMessageId)}
						onReport={setReportedChatMessage}
					/>
				)}
			/>
			{/* the report sheet, mounted while a message is being reported */}
			{reportedChatMessage?.authorUserId && (
				<ReportIssueDialog
					subjectKind="chatMessage"
					subjectId={String(reportedChatMessage.id)}
					subjectLabel={toReportedChatMessageLabel(reportedChatMessage.authorUsername)}
					author={{ id: reportedChatMessage.authorUserId, username: reportedChatMessage.authorUsername }}
					onClose={() => setReportedChatMessage(null)}
				/>
			)}
			{/* rejection */}
			{chatRoom.rejection && (
				<ScrollView className="max-h-36 shrink" style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 12 }}>
					{chatRoom.rejection === "budget" ? (
						<ChatRejectionNotice rejection="budget" />
					) : (
						<Text className="text-sm text-muted-foreground">{CHAT_ROOM_REJECTION_COPY[chatRoom.rejection]}</Text>
					)}
					<Button variant="ghost" accessibilityLabel="Dismiss rejection" onPress={chatRoom.clearRejection}>
						<Text>Dismiss</Text>
					</Button>
				</ScrollView>
			)}
			{/* topic draft */}
			{editableTopicDraft && (
				<TopicDraftCard
					{...editableTopicDraft}
					topicId={topicId}
					isCarlReplying={chatRoom.isMessageLoading}
					onDismissTopicEdit={clearProposedTopicEdit}
				/>
			)}
			{/* composer */}
			<ChatRoomComposer reply={chatRoomReply} memberUsernames={memberUsernames} onPost={chatRoom.postChatMessage} />
		</View>
	)
}
