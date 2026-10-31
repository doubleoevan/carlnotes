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

// the draft, its send and stop, and how the box reads and grows
type ComposerBoxProps = {
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
	// the files waiting on the next send, and the attach and kept-files controls beside the draft
	attachments?: ChatAttachment[]
	attachmentActions?: ReactNode
	// what takes Send's place while nothing streams, such as the mic of an empty box
	sendSlot?: ReactNode
}

/**
 * Keeps the web's composer, its attachment chips, and Stop control above the native keyboard. A send slot takes the
 * Send button's place, and a recording bar takes the box's place while a recording runs.
 */
export function ChatComposer({
	header,
	onRemoveAttachment,
	recordingBar,
	...composerBoxProps
}: ComposerBoxProps & {
	header?: ReactNode
	onRemoveAttachment?: (index: number) => void
	// the recording bar, which replaces the box while a recording runs
	recordingBar?: ReactNode
}) {
	// keep the header's content height for the header scroll's minimum height
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
			{onRemoveAttachment && (
				<ChatAttachmentChips attachments={composerBoxProps.attachments ?? []} onRemove={onRemoveAttachment} />
			)}
			{/* the recording bar replaces the box while a recording runs */}
			{recordingBar ? (
				<View className="min-h-16 flex-row items-center rounded-xl border border-border bg-bubble p-2">
					{recordingBar}
				</View>
			) : (
				<ComposerBox {...composerBoxProps} />
			)}
		</View>
	)
}

// the draft's box, which shrinks before allowing Send to leave the keyboard-safe area
function ComposerBox({
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
	attachments = [],
	attachmentActions,
	sendSlot,
}: ComposerBoxProps) {
	// the native input grows with its draft, or with its placeholder while empty, and stretches to fill the box if
	// the keyboard leaves the box less room
	const { theme } = useUniwind()
	return (
		<View className="min-h-16 shrink flex-row items-end gap-2 rounded-xl border border-border bg-bubble p-2">
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
					alignSelf: "stretch",
					minHeight: 44,
					maxHeight: 120,
					textAlignVertical: "top",
				}}
			/>
			{/* the send slot takes Send's place while nothing streams */}
			{!isStreaming && sendSlot ? (
				sendSlot
			) : (
				<SendButton
					isStreaming={isStreaming}
					isDisabled={isDisabled || (!value.trim() && attachments.length === 0)}
					onSend={onSend}
					onStop={onStop}
				/>
			)}
		</View>
	)
}

// Send, or Stop while an answer streams
function SendButton({
	isStreaming,
	isDisabled,
	onSend,
	onStop,
}: Pick<ComposerBoxProps, "isStreaming" | "isDisabled" | "onSend" | "onStop">) {
	return (
		<Button
			size="icon"
			accessibilityLabel={isStreaming ? "Stop" : "Send"}
			disabled={!isStreaming && isDisabled}
			onPress={isStreaming ? onStop : onSend}
		>
			<Icon as={isStreaming ? Square : ArrowUp} className="size-4" fill={isStreaming ? "currentColor" : "none"} />
		</Button>
	)
}
