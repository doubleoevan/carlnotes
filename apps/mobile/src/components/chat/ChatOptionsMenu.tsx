import { CLEAR_CHAT_COPY } from "@carlnotes/core/lib/chatCopy"
import { toCurrentChatGuard } from "@carlnotes/core/stores/chatConversationStore"
import { EllipsisVertical, Trash2 } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { Alert, type View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Keeps destructive clearing behind the web's confirmation wording.
 */
export function ChatOptionsMenu({
	onClear,
	isRoom,
	isDisabled,
}: {
	onClear: () => Promise<boolean>
	isRoom?: boolean
	isDisabled?: boolean
}) {
	// keep the action sheet and its pending confirmation on this conversation
	const [isOpen, setIsOpen] = useState(false)
	const [isClearing, setIsClearing] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const handleClear = (): void => {
		// capture the conversation before opening confirmation
		const isCurrentChat = toCurrentChatGuard()
		setIsOpen(false)
		Alert.alert(CLEAR_CHAT_COPY.title, isRoom ? CLEAR_CHAT_COPY.room : CLEAR_CHAT_COPY.private, [
			{ text: CLEAR_CHAT_COPY.cancel, style: "cancel" },
			{
				text: CLEAR_CHAT_COPY.confirm,
				style: "destructive",
				onPress: () => {
					if (!isCurrentChat()) {
						return
					}
					// report completion while the same conversation remains open
					setIsClearing(true)
					void onClear()
						.then((isChatCleared) => {
							if (isCurrentChat()) {
								Alert.alert(isChatCleared ? CLEAR_CHAT_COPY.succeeded : CLEAR_CHAT_COPY.failed)
							}
						})
						.catch(() => {
							if (isCurrentChat()) {
								Alert.alert(CLEAR_CHAT_COPY.failed)
							}
						})
						.finally(() => {
							if (isCurrentChat()) {
								setIsClearing(false)
							}
						})
				},
			},
		])
	}
	return (
		<>
			{/* options trigger */}
			<Button
				ref={triggerRef}
				variant="ghost"
				size="icon"
				accessibilityLabel="Chat options"
				disabled={isDisabled || isClearing}
				onPress={() => setIsOpen(true)}
			>
				<Icon as={EllipsisVertical} className="size-4" />
			</Button>
			{/* chat actions */}
			{isOpen && (
				<Sheet title="Chat options" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					{/* options trigger */}
					<Button
						variant="ghost"
						accessibilityLabel={isRoom ? "Clear chat room" : "Clear private chat"}
						onPress={handleClear}
					>
						<Icon as={Trash2} className="size-4" />
						<Text>{isRoom ? "Clear chat room" : "Clear private chat"}</Text>
					</Button>
				</Sheet>
			)}
		</>
	)
}
