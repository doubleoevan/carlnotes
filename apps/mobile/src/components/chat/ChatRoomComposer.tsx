import { CHAT_ROOM_MESSAGE_MAX_CHARS } from "@carlnotes/contracts/chat"
import type { ChatRoomState } from "@carlnotes/core/hooks/useChatRoom"
import type { ChatRoomReply } from "@carlnotes/core/hooks/useRoomReply"
import {
	toActiveChatMention,
	toChangedMentionChatMessage,
	toChatMentionSuggestions,
	toChatMessage,
	toInsertedChatMention,
} from "@carlnotes/core/lib/chatMentions"
import { toComposerPlaceholder, toReplyUser } from "@carlnotes/core/lib/chatRoomReplies"
import { Reply } from "lucide-react-native"
import { type ComponentRef, useEffect, useRef, useState } from "react"
import { ScrollView, type TextInput, View } from "react-native"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { ChatComposer } from "./ChatComposer"

/**
 * Uses shared mention and reply rules with the native input's caret and accepted-post behavior.
 */
export function ChatRoomComposer({
	reply,
	memberUsernames,
	onPost,
}: {
	reply: ChatRoomReply
	memberUsernames: string[]
	onPost: ChatRoomState["postChatMessage"]
}) {
	// retain the unsent text, caret and native focus through a rejected post
	const [chatMessage, setChatMessage] = useState("")
	const [caretPosition, setCaretPosition] = useState(0)
	const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>()
	const [isPosting, setIsPosting] = useState(false)
	const isPostingRef = useRef(false)
	const inputRef = useRef<ComponentRef<typeof TextInput>>(null)

	// focus the composer when the reader chooses a reply
	useEffect(() => {
		if (reply.replyTo && !reply.isAutoReply) {
			inputRef.current?.focus()
		}
	}, [reply.replyTo, reply.isAutoReply])

	// derive member suggestions and the recipient from the same rules as web
	const mentionQuery = toActiveChatMention(chatMessage.slice(0, caretPosition))
	const mentionSuggestions = mentionQuery === null ? [] : toChatMentionSuggestions(mentionQuery, memberUsernames)
	const replyTarget = toReplyUser({
		chatMessage: chatMessage,
		memberUsernames,
		replyTo: reply.replyTo,
		isAutoReply: reply.isAutoReply,
	})

	// clear text and reply state only after an accepted post
	const handleSend = async (): Promise<void> => {
		if (!chatMessage.trim() || isPostingRef.current) {
			return
		}
		// prevent duplicate sends while the current post is pending
		isPostingRef.current = true
		setIsPosting(true)
		const isReplyToChatMessage = !replyTarget.hasMention && reply.replyTo !== null
		try {
			const isChatMessagePosted = await onPost({
				content: replyTarget.hasMention || isReplyToChatMessage ? chatMessage.trim() : `@all ${chatMessage.trim()}`,
				replyToChatMessageId: isReplyToChatMessage ? (reply.replyTo?.id ?? null) : null,
				attachments: [],
			})
			if (isChatMessagePosted) {
				// clear the posted message and reply
				setChatMessage("")
				setCaretPosition(0)
				reply.clear()
			}
		} finally {
			// release the composer after either outcome
			isPostingRef.current = false
			setIsPosting(false)
		}
	}

	// change the mention or reply while preserving the rest of the message
	const handleSelectTarget = (selectedReplyValue: string): void => {
		if (selectedReplyValue === "all" || selectedReplyValue === "carl") {
			// apply the selected mention
			reply.clear()
			setChatMessage(toChangedMentionChatMessage(chatMessage, selectedReplyValue, memberUsernames))
		} else {
			// select a message to reply to
			const selectedReplyChatMessage = reply.replyChatMessages.find(
				(replyChatMessage) => String(replyChatMessage.chatMessage.id) === selectedReplyValue,
			)
			if (selectedReplyChatMessage) {
				setChatMessage(toChatMessage(chatMessage, memberUsernames))
				reply.selectChatMessage(selectedReplyChatMessage.chatMessage)
			}
		}
	}

	// show the selected recipient above the input
	const selectedReplyValue = !replyTarget.hasMention && reply.replyTo ? String(reply.replyTo.id) : replyTarget.replyUser
	const replyControls = (
		<>
			{/* reply recipient */}
			{mentionSuggestions.length === 0 && (
				<View className="flex-row items-center gap-2">
					<ChoiceSelect
						label="Pick who to reply to"
						value={selectedReplyValue}
						options={[
							{ value: "all", label: "Replying to @all", icon: Reply },
							{ value: "carl", label: "Replying to Carl", icon: Reply },
							...(replyTarget.hasMention && !["all", "carl"].includes(replyTarget.replyUser)
								? [{ value: replyTarget.replyUser, label: `Replying to ${replyTarget.replyUser}`, icon: Reply }]
								: []),
							...reply.replyChatMessages.map((replyChatMessage) => ({
								value: String(replyChatMessage.chatMessage.id),
								label: `Replying to ${replyChatMessage.username}`,
								icon: Reply,
							})),
						]}
						onChange={handleSelectTarget}
					/>
				</View>
			)}
			{/* mention suggestions */}
			{mentionSuggestions.length > 0 && (
				<ScrollView className="max-h-40 rounded-md border border-border bg-popover" keyboardShouldPersistTaps="handled">
					{mentionSuggestions.map((username) => (
						<Button
							key={username}
							variant="ghost"
							accessibilityLabel={`Mention ${username}`}
							onPress={() => {
								// insert the selected name at the caret and keep keyboard focus
								const insertedChatMention = toInsertedChatMention({
									message: chatMessage,
									caret: caretPosition,
									username,
								})
								setChatMessage(insertedChatMention.message)
								setCaretPosition(insertedChatMention.caret)
								setInputSelection({ start: insertedChatMention.caret, end: insertedChatMention.caret })
								inputRef.current?.focus()
							}}
						>
							<Text>@{username}</Text>
						</Button>
					))}
				</ScrollView>
			)}
		</>
	)
	return (
		<ChatComposer
			header={replyControls}
			inputRef={inputRef}
			value={chatMessage}
			onChange={(selectedReplyValue) => {
				// edit the message and release the fixed selection
				setChatMessage(selectedReplyValue)
				setInputSelection(undefined)
			}}
			onSend={() => void handleSend()}
			isDisabled={isPosting}
			placeholder={toComposerPlaceholder(replyTarget.replyUser)}
			maxLength={CHAT_ROOM_MESSAGE_MAX_CHARS}
			inputProps={{
				selection: inputSelection,
				onSelectionChange: (event) => setCaretPosition(event.nativeEvent.selection.start),
			}}
		/>
	)
}
