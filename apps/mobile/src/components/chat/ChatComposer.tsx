import { CHAT_QUESTION_CHARS } from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { CHAT_QUESTION_PLACEHOLDER } from "@carlnotes/core/lib/chatCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { colors } from "@carlnotes/nightshift/colors"
import { ArrowUp, Square } from "lucide-react-native"
import { type ComponentRef, type ReactNode, type Ref, useState } from "react"
import { ScrollView, TextInput, type TextInputProps, View } from "react-native"
import { useUniwind } from "uniwind"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { ChatAttachmentChips } from "./ChatAttachmentChips"

/**
 * Keeps the web's composer, its attachment chips, and Stop control above the native keyboard.
 */
export function ChatComposer({
	value,
	onChange,
	onSend,
	onStop,
	isStreaming,
	isDisabled,
	placeholder = CHAT_QUESTION_PLACEHOLDER,
	maxLength = CHAT_QUESTION_CHARS,
	inputProps,
	inputRef,
	header,
	attachments = [],
	onRemoveAttachment,
	attachmentActions,
}: {
	value: string
	onChange: (value: string) => void
	onSend: () => void
	onStop?: () => void
	isStreaming?: boolean
	isDisabled?: boolean
	placeholder?: string
	maxLength?: number
	inputProps?: TextInputProps
	inputRef?: Ref<ComponentRef<typeof TextInput>>
	header?: ReactNode
	// the files waiting on the next send, and the attach and kept-files controls beside the draft
	attachments?: ChatAttachment[]
	onRemoveAttachment?: (index: number) => void
	attachmentActions?: ReactNode
}) {
	// grow the native input within the keyboard-safe composer
	const { theme } = useUniwind()
	const [inputContentHeight, setInputContentHeight] = useState(44)
	const [inputViewportHeight, setInputViewportHeight] = useState(120)
	const [headerHeight, setHeaderHeight] = useState(0)
	// shrink only into a header's scroll, so the chips and the draft never clip under a sibling draft card
	return (
		<View className={cn("max-h-full gap-2.5 border-t border-border px-3 py-2.5", header ? "shrink" : "shrink-0")}>
			{/* keep reply controls reachable when the keyboard leaves little room */}
			{header && (
				<ScrollView
					style={{ flexGrow: 0, flexShrink: 1, minHeight: Math.min(64, headerHeight) }}
					contentContainerClassName="gap-2.5"
					keyboardShouldPersistTaps="handled"
					onContentSizeChange={(_width, contentHeight) => setHeaderHeight(contentHeight)}
				>
					{header}
				</ScrollView>
			)}
			{/* the files waiting on the send, each removable until it goes */}
			{onRemoveAttachment && <ChatAttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />}
			{/* shrink the draft before allowing Send to leave the keyboard-safe area */}
			<View
				className="min-h-16 shrink flex-row items-end gap-2 rounded-xl border border-border bg-bubble p-2"
				style={{ height: Math.min(120, Math.max(44, inputContentHeight)) + 18 }}
				onLayout={(event) => setInputViewportHeight(Math.max(44, event.nativeEvent.layout.height - 18))}
			>
				{attachmentActions && <View className="flex-row items-center">{attachmentActions}</View>}
				<TextInput
					ref={inputRef}
					{...inputProps}
					accessibilityLabel="Message"
					testID="chat-message"
					value={value}
					onChangeText={onChange}
					multiline
					maxLength={maxLength}
					editable={!isDisabled && !isStreaming}
					placeholder={placeholder}
					placeholderTextColor={colors.mutedForeground[theme === "dark" ? "dark" : "light"]}
					className="flex-1 font-sans text-sm text-foreground"
					style={{
						minHeight: 44,
						height: inputViewportHeight,
						textAlignVertical: "top",
					}}
					onContentSizeChange={(event) => setInputContentHeight(event.nativeEvent.contentSize.height)}
				/>
				<Button
					size="icon"
					accessibilityLabel={isStreaming ? "Stop" : "Send"}
					disabled={!isStreaming && (isDisabled || (!value.trim() && attachments.length === 0))}
					onPress={isStreaming ? onStop : onSend}
				>
					<Icon as={isStreaming ? Square : ArrowUp} className="size-4" fill={isStreaming ? "currentColor" : "none"} />
				</Button>
			</View>
		</View>
	)
}
