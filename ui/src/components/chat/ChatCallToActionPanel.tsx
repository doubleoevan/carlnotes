// the chat panel shown when a call to action is shown instead of the conversation
import type * as React from "react"
import type { ChatOptionsMenuProps } from "@/components/chat/ChatOptionsMenu"
import {
	type ChatPanelCurrentRoom,
	ChatPanelHeader,
	ChatPanelWidget,
	renderOnTop,
} from "@/components/chat/ChatPanelWidget"
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
	onPanelState: (next: ChatPanelState) => void
	currentChatRoom?: ChatPanelCurrentRoom
	chatRoomMenu?: ChatOptionsMenuProps
	// the one sentence over the call-to-action button
	actionLine: string
	// what the composer shows
	placeholder?: string
	// the call-to-action button goes here
	children: React.ReactNode
}) {
	return renderOnTop(
		<ChatPanelWidget isEnlarged={isEnlarged} onMinimizeChat={() => onPanelState("collapsed")}>
			<ChatPanelHeader
				isEnlarged={isEnlarged}
				isRoom
				onToggleSize={() => onPanelState(isEnlarged ? "open" : "enlarged")}
				onCollapse={() => onPanelState("collapsed")}
				currentChatRoom={currentChatRoom}
				chatRoomMenu={chatRoomMenu}
			/>
			{/* the padding keeps the action line off the title bar and the call-to-action button off the composer's top border */}
			<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-5 pb-4 text-center">
				<p className="font-display text-lg">{actionLine}</p>
				{children}
			</div>
			<DisabledRoomComposer placeholder={placeholder} />
		</ChatPanelWidget>,
	)
}
