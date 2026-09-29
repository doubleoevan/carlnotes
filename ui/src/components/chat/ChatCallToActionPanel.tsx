// the chat panel shown when a call to action is shown instead of the conversation
import type * as React from "react"
import type { ChatOptionsMenuProps, CurrentChatRoomOption } from "@/components/chat/ChatOptionsMenu"
import { ChatPanelWidget } from "@/components/chat/ChatPanelWidget"
import { DisabledRoomComposer } from "@/components/chat/ChatRoomComposer"
import type { ChatPanelState } from "@/stores/chatPanelStore"

/**
 * The chat panel shown when a call to action is shown instead of a conversation
 * joining the team that holds this topic, signing up, or starting a first topic.
 * One line and one button over a disabled composer.
 */
export function ChatCallToActionPanel({
	isEnlarged,
	onPanelState,
	currentChatRoom,
	chatRoomMenu,
	actionLine,
	placeholder,
	children,
}: {
	isEnlarged: boolean
	onPanelState: (nextPanelState: ChatPanelState) => void
	currentChatRoom?: CurrentChatRoomOption
	chatRoomMenu?: ChatOptionsMenuProps
	// the one sentence over the call-to-action button
	actionLine: string
	// what the composer shows
	placeholder?: string
	// the call-to-action button goes here
	children: React.ReactNode
}) {
	return (
		<ChatPanelWidget
			isEnlarged={isEnlarged}
			onPanelState={onPanelState}
			isRoom
			currentChatRoom={currentChatRoom}
			chatRoomMenu={chatRoomMenu}
		>
			{/* the action line and the call-to-action button, padded to give space from the title bar and the composer */}
			<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-5 pb-4 text-center">
				<p className="font-display text-lg">{actionLine}</p>
				{children}
			</div>
			<DisabledRoomComposer placeholder={placeholder} />
		</ChatPanelWidget>
	)
}
