import type { ChatPage } from "@carlnotes/client/chatClient"
import { CHAT_HISTORY_TURNS, toUncompactedChatTurnStart } from "@carlnotes/contracts/chatTurns"
import type { ChatMessageAuthor } from "@carlnotes/core/components/ChatTurnBlock"
import type { TopicDraftFile } from "@carlnotes/core/components/TopicDraftCard"
import type { NewTopicDraft } from "@carlnotes/core/hooks/useNewTopicDraft"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { type TopicChat, useTopicChat } from "@carlnotes/core/hooks/useTopicChat"
import { CHAT_QUESTION_PLACEHOLDER, NEW_TOPIC_CHAT_COPY } from "@carlnotes/core/lib/chatCopy"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import type { ChatTurn } from "@carlnotes/core/lib/chatTurns"
import { clearProposedTopicEdit } from "@carlnotes/core/stores/chatConversationStore"
import { useEffect, useRef } from "react"
import { type FlatList, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { Text } from "@/components/primitives/text"
import { useIsScreenActive } from "@/hooks/useIsScreenActive"
import type { PickedFile } from "@/pickedFiles"
import { ChatComposer } from "./ChatComposer"
import { ChatAttachButton, KeptAttachmentsButton } from "./ChatComposerAttachments"
import { ChatMessageList } from "./ChatMessageList"
import { ChatOptionsMenu } from "./ChatOptionsMenu"
import { ChatRejectionNotice } from "./ChatRejectionNotice"
import { ChatTopicLimitNotice } from "./ChatTopicLimitNotice"
import { ChatTurnBlock } from "./ChatTurnBlock"
import { showChatNotice } from "./chatNotice"
import { isMicShown, MicButton } from "./MicButton"
import { RecordingBar } from "./RecordingBar"
import { TopicDraftCard } from "./TopicDraftCard"
import { type PickedChatAttachments, useChatAttachments } from "./useChatAttachments"
import { useNewTopicDraft } from "./useNewTopicDraft"
import { useLeaveVoiceRecordingOnBlur, useVoiceRecording } from "./useVoiceRecording"

/**
 * Uses the web conversation state, the new-topic chat included, with native cancellation and authoritative history on
 * return.
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
	// use the shared conversation with picked files, the new-topic draft, and native notices
	const chatAttachmentState = useChatAttachments()
	const topicDraftState = useNewTopicDraft(page)
	const topicChat = useTopicChat({
		page,
		attachmentState: chatAttachmentState,
		draftState: topicDraftState,
		onNotice: showChatNotice,
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

	// a new-topic chat's files also wait on the draft for the topic it creates, so their copies stay for the upload
	const handlePickedFiles = async (pickedFiles: PickedFile[]): Promise<void> => {
		if (!page.newTopic) {
			await chatAttachmentState.addPickedFiles(pickedFiles)
			return
		}
		const takenFiles = await chatAttachmentState.addPickedFiles(pickedFiles, { isTakenFileRetained: true })
		topicDraftState.addTopicDraftAttachmentFiles(takenFiles)
	}

	// retain the shared history boundary and gate before rendering the composer
	const chatHistoryStart = Math.max(0, topicChat.chatTurns.length - CHAT_HISTORY_TURNS)
	const uncompactedChatTurnStart =
		chatHistoryStart + toUncompactedChatTurnStart(topicChat.chatTurns.slice(-CHAT_HISTORY_TURNS))
	if (topicChat.hasLoadFailed) {
		return (
			<LoadFailedNotice
				className="p-3"
				message="Carl could not open this conversation."
				retryLabel="Retry conversation"
				onRetry={topicChat.reload}
			/>
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
				emptyText={toEmptyText({ page, chatName, isBudgetExhausted: topicChat.isBudgetExhausted })}
				renderItem={(chatTurn, index) => (
					<ChatTurnBlock
						chatTurn={chatTurn}
						index={index}
						uncompactedChatTurnStart={uncompactedChatTurnStart}
						isLast={index === topicChat.chatTurns.length - 1}
						isStreaming={topicChat.isStreaming}
						now={now}
						author={author}
						voiceChatPage={topicChat.voiceChatPage}
						onRetry={(question) => void topicChat.send(question)}
					/>
				)}
			/>
			{/* the new-topic draft with its files, or the limit notice if the plan has no topics left */}
			{page.newTopic && <TopicDraftOrLimitNotice topicChat={topicChat} topicDraftState={topicDraftState} />}
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
				<PrivateChatComposer
					page={page}
					topicChat={topicChat}
					chatAttachmentState={chatAttachmentState}
					isActive={isActive}
					onPickedFiles={handlePickedFiles}
				/>
			)}
		</View>
	)
}

// the composer with its files and its mic. the composer owns the recording, so the meter re-renders the composer alone
function PrivateChatComposer({
	page,
	topicChat,
	chatAttachmentState,
	isActive,
	onPickedFiles,
}: {
	page: ChatPage
	topicChat: TopicChat
	chatAttachmentState: PickedChatAttachments
	isActive: boolean
	onPickedFiles: (pickedFiles: PickedFile[]) => Promise<void>
}) {
	// the recording the mic starts, whose transcript sends as a spoken question. the recording and listen mode end once
	// the chat's screen loses focus
	const voiceRecording = useVoiceRecording({
		page: topicChat.voiceChatPage,
		onTranscript: (transcript, timings) =>
			void topicChat.send(transcript, { isSpoken: true, spokenQuestionTimings: timings }),
	})
	useLeaveVoiceRecordingOnBlur(voiceRecording)

	// the box is read-only and Send off while the microphone is asked for or the transcript is on its way, so a typed
	// send never races the spoken one. the mic takes the send slot of an empty box while voice is on and nothing streams
	const isVoiceRecordingBusy = voiceRecording.state !== "idle"
	const isMicInSendSlot = isMicShown({
		voiceChatPage: topicChat.voiceChatPage,
		draft: topicChat.question,
		attachmentCount: topicChat.attachments.length,
		isBusy: topicChat.isStreaming,
	})
	return (
		<ChatComposer
			value={topicChat.question}
			onChange={topicChat.setQuestion}
			onSend={() => {
				// a typed question ends listen mode
				voiceRecording.stopListening()
				void topicChat.send()
			}}
			onStop={topicChat.stop}
			isStreaming={topicChat.isStreaming}
			isDisabled={!isActive || !topicChat.canChat || isVoiceRecordingBusy}
			placeholder={toPlaceholder(page, topicChat.isFirstTopic)}
			attachments={topicChat.attachments}
			onRemoveAttachment={chatAttachmentState.removeAttachment}
			attachmentActions={
				<>
					<ChatAttachButton
						isDisabled={!isActive || !topicChat.canChat || topicChat.isStreaming}
						attachmentCount={topicChat.attachments.length}
						onPicked={onPickedFiles}
					/>
					{topicChat.keptAttachments.length > 0 && (
						<KeptAttachmentsButton
							keptAttachments={topicChat.keptAttachments}
							onRemoveKeptAttachment={chatAttachmentState.removeKeptAttachment}
						/>
					)}
				</>
			}
			sendSlot={isMicInSendSlot ? <MicButton voiceRecording={voiceRecording} /> : undefined}
			recordingBar={voiceRecording.state === "recording" ? <RecordingBar voiceRecording={voiceRecording} /> : undefined}
		/>
	)
}

// the private chat's placeholder, or the new-topic chat's for a first or a next topic
function toPlaceholder(page: ChatPage, isFirstTopic: boolean): string {
	if (!page.newTopic) {
		return CHAT_QUESTION_PLACEHOLDER
	}
	return isFirstTopic ? NEW_TOPIC_CHAT_COPY.firstTopicPlaceholder : NEW_TOPIC_CHAT_COPY.placeholder
}

// a picked file as the draft card lists it
function toTopicDraftFile(pickedFile: PickedFile): TopicDraftFile {
	return { name: pickedFile.name, size: pickedFile.byteSize, lastModified: 0 }
}

// the empty conversation's text, which is nothing once the budget is spent, the new-topic chat's opening line, or a hot take
function toEmptyText({
	page,
	chatName,
	isBudgetExhausted,
}: {
	page: ChatPage
	chatName: string
	isBudgetExhausted: boolean
}): string {
	if (isBudgetExhausted) {
		return ""
	}
	return page.newTopic ? NEW_TOPIC_CHAT_COPY.openingLine : `Ask me for a hot take on ${chatName || "this chat"}.`
}

// the limit notice if the plan holds no more topics, or else carl's topic draft and its files
function TopicDraftOrLimitNotice({
	topicChat,
	topicDraftState,
}: {
	topicChat: TopicChat
	topicDraftState: NewTopicDraft<PickedFile>
}) {
	if (topicChat.topicsRemaining === 0 && topicChat.topicLimit !== null) {
		return <ChatTopicLimitNotice topicLimit={topicChat.topicLimit} />
	}
	return (
		<TopicDraftCard
			topicDraft={topicChat.topicDraft}
			isCarlReplying={topicChat.isStreaming}
			attachmentFiles={topicDraftState.topicDraftAttachmentFiles.map(toTopicDraftFile)}
			onRemoveAttachmentFile={topicDraftState.removeTopicDraftAttachmentFile}
		/>
	)
}
