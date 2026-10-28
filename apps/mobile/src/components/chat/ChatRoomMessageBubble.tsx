import {
	type ChatRoomMessageBubbleProps,
	type ChatRoomMessageElements,
	ChatRoomMessageBubble as SharedChatRoomMessageBubble,
} from "@carlnotes/core/components/ChatRoomMessageBubble"
import { DELETE_CHAT_MESSAGE_COPY } from "@carlnotes/core/lib/chatCopy"
import { toTimeAgoLabel } from "@carlnotes/core/lib/chatMessages"
import { cn } from "@carlnotes/nightshift/classNames"
import { Reply, Trash2 } from "lucide-react-native"
import { Alert, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ChatAuthor } from "./ChatAuthor"
import { ChatMarkdown } from "./ChatMarkdown"
import { ChatAttachmentChips, ChatLinkPreviews, ChatMessageAction, CopyButton } from "./ChatMessageParts"

/**
 * Adapts the shared room message and attachment chips to native controls.
 */
export function ChatRoomMessageBubble(props: ChatRoomMessageBubbleProps) {
	return <SharedChatRoomMessageBubble {...props} elements={CHAT_ROOM_MESSAGE_ELEMENTS} />
}

// native elements for the shared room message
const CHAT_ROOM_MESSAGE_ELEMENTS: ChatRoomMessageElements = {
	Author: ChatAuthor,
	Frame: ({ children, isOwn }) => <View className={cn("w-full", isOwn ? "items-end" : "items-start")}>{children}</View>,
	Quote: ({ message, onSelect }) => (
		<Button
			variant="ghost"
			className="mb-0.5 h-auto max-w-[92%] flex-col items-start rounded-lg border-l-2 border-border bg-bubble/60 px-2.5 py-1"
			accessibilityLabel={`Jump to ${message.authorUsername}'s message`}
			onPress={() => onSelect(message.id)}
		>
			<View className="flex-row items-center gap-1">
				<Icon as={Reply} className="size-3 text-muted-foreground" />
				<Text className="text-xs text-muted-foreground">{message.authorUsername}</Text>
			</View>
			<Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={3}>
				{message.content}
			</Text>
		</Button>
	),
	Body: ({ content, isOwn, isModel }) => (
		<View
			className={cn(
				"max-w-[92%] rounded-2xl px-3.5 py-2",
				isOwn ? "rounded-br-sm bg-primary" : "rounded-bl-sm bg-bubble",
			)}
		>
			{isModel ? (
				<ChatMarkdown markdown={content} />
			) : (
				<Text className={cn("text-sm", isOwn ? "text-primary-foreground" : "text-foreground")}>{content}</Text>
			)}
		</View>
	),
	Previews: ({ previews, isLoading }) => (
		<>
			<ChatLinkPreviews previews={previews} />
			{isLoading && !previews.length && <Text className="text-xs text-muted-foreground">Loading preview…</Text>}
		</>
	),
	Attachments: ({ chatMessage }) => <ChatAttachmentChips attachments={chatMessage.attachments} />,
	Footer: ({ chatMessage, isOwnChatMessage, canDelete, onDeleteChatMessage, onReply, now }) => (
		<View className={cn("mt-1 flex-row flex-wrap items-center gap-2", isOwnChatMessage && "flex-row-reverse")}>
			<CopyButton text={chatMessage.content} />
			{canDelete && (
				<ChatMessageAction
					accessibilityLabel="Delete message"
					onPress={() =>
						Alert.alert(
							DELETE_CHAT_MESSAGE_COPY.title,
							DELETE_CHAT_MESSAGE_COPY.description,
							[
								{ text: DELETE_CHAT_MESSAGE_COPY.cancel, style: "cancel" },
								{
									text: DELETE_CHAT_MESSAGE_COPY.confirm,
									style: "destructive",
									onPress: () => onDeleteChatMessage(chatMessage.id),
								},
							],
							{ cancelable: true },
						)
					}
				>
					<Icon as={Trash2} className="size-3 text-muted-foreground" />
				</ChatMessageAction>
			)}
			<ChatMessageAction accessibilityLabel="Reply to message" onPress={() => onReply(chatMessage)}>
				<Icon as={Reply} className="size-3 text-muted-foreground" />
				<Text className="text-xs text-muted-foreground">Reply</Text>
			</ChatMessageAction>
			<Text className="text-xs text-muted-foreground">
				{toTimeAgoLabel(new Date(chatMessage.createdAt).getTime(), now)}
			</Text>
		</View>
	),
}
