import { CHAT_QUESTION_CHARS } from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import type { SuggestedReplyAcceptMethod } from "@carlnotes/core/hooks/useSuggestedReply"
import { CHAT_QUESTION_PLACEHOLDER, SUGGESTED_REPLY_COPY } from "@carlnotes/core/lib/chatCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { colors } from "@carlnotes/nightshift/colors"
import { ArrowRightToLine, ArrowUp, Square } from "lucide-react-native"
import { type ComponentRef, type ReactNode, type Ref, useMemo, useRef, useState } from "react"
import { Dimensions, Platform, ScrollView, TextInput, type TextInputProps, View } from "react-native"
import { GestureDetector, type PanGesture, usePanGesture } from "react-native-gesture-handler"
import Animated, { FadeIn } from "react-native-reanimated"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useIsReduceMotionEnabled } from "@/hooks/useIsReduceMotionEnabled"
import { useColorMode } from "@/theme"
import { ChatAttachmentChips } from "./ChatAttachmentChips"
import {
	isSuggestedReplySwipeEnabled,
	isSuggestedReplySwipeStart,
	SUGGESTED_REPLY_SWIPE_OFFSETS,
} from "./suggestedReplySwipe"

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
	// the suggested reply the empty box shows in its placeholder's place, and accepting it by button or swipe
	suggestedReply?: string | null
	onAcceptSuggestedReply?: (acceptMethod: Extract<SuggestedReplyAcceptMethod, "button" | "swipe">) => void
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
	suggestedReply = null,
	onAcceptSuggestedReply,
}: ComposerBoxProps) {
	// the native input grows with its draft, or with its placeholder while empty, and stretches to fill the box if
	// the keyboard leaves the box less room. a suggestion shows on one line over the empty box instead of the placeholder
	const colorMode = useColorMode()
	const shownSuggestedReply = value === "" ? suggestedReply : null
	const suggestedReplySwipe = useSuggestedReplySwipe({ value, suggestedReply, onAcceptSuggestedReply })
	return (
		<View className="min-h-16 shrink flex-row items-end gap-2 rounded-xl border border-border bg-bubble p-2">
			{attachmentActions && <View className="flex-row items-center">{attachmentActions}</View>}
			<GestureDetector gesture={suggestedReplySwipe}>
				<View className="flex-1 self-stretch">
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
						placeholder={shownSuggestedReply ? "" : placeholder}
						placeholderTextColor={colors.mutedForeground[colorMode]}
						className="flex-1 font-sans text-sm text-foreground"
						style={{
							alignSelf: "stretch",
							minHeight: 44,
							maxHeight: 120,
							textAlignVertical: "top",
						}}
					/>
					<SuggestedReplyLine suggestedReply={shownSuggestedReply} />
				</View>
			</GestureDetector>
			{/* the suggestion's accept button */}
			{shownSuggestedReply && onAcceptSuggestedReply && (
				<Button
					size="icon-sm"
					variant="ghost"
					accessibilityLabel={SUGGESTED_REPLY_COPY.toAcceptLabel(shownSuggestedReply)}
					onPress={() => onAcceptSuggestedReply("button")}
				>
					<Icon as={ArrowRightToLine} className="size-4" />
				</Button>
			)}
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

// the suggestion as the empty box's one-line placeholder, cut with an ellipsis and hidden from a screen reader, which
// hears it on the accept button. reduced motion shows it with no fade
function SuggestedReplyLine({ suggestedReply }: { suggestedReply: string | null }) {
	const isReduceMotionEnabled = useIsReduceMotionEnabled()
	if (!suggestedReply) {
		return null
	}
	return (
		<Animated.View
			entering={isReduceMotionEnabled ? undefined : FadeIn}
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			className="absolute inset-x-0 top-0"
			style={{ paddingTop: Platform.OS === "ios" ? 13 : 12 }}
		>
			<Text numberOfLines={1} className="font-sans text-sm text-muted-foreground">
				{suggestedReply}
			</Text>
		</Animated.View>
	)
}

// the box's draft, its suggestion, and the accept the swipe calls
type UseSuggestedReplySwipeOptions = Pick<ComposerBoxProps, "value" | "onAcceptSuggestedReply"> & {
	suggestedReply: string | null
}

// a swipe right across the empty box accepts its suggestion. a vertical drag scrolls instead, text in the box
// turns it off, and on Android a start at either edge belongs to the back gesture
function useSuggestedReplySwipe({
	value,
	suggestedReply,
	onAcceptSuggestedReply,
}: UseSuggestedReplySwipeOptions): PanGesture {
	// the latest accept and the swipe's start, read through refs, so the config changes only when the swipe turns on or off
	const swipeStartXRef = useRef(0)
	const onAcceptSuggestedReplyRef = useRef(onAcceptSuggestedReply)
	onAcceptSuggestedReplyRef.current = onAcceptSuggestedReply
	const isSwipeEnabled = onAcceptSuggestedReply !== undefined && isSuggestedReplySwipeEnabled({ value, suggestedReply })
	const swipeConfig = useMemo(
		() => ({
			...SUGGESTED_REPLY_SWIPE_OFFSETS,
			enabled: isSwipeEnabled,
			runOnJS: true,
			onBegin: (event: { absoluteX: number }) => {
				swipeStartXRef.current = event.absoluteX
			},
			onActivate: () => {
				const screenWidth = Dimensions.get("window").width
				if (isSuggestedReplySwipeStart({ startX: swipeStartXRef.current, screenWidth, platform: Platform.OS })) {
					onAcceptSuggestedReplyRef.current?.("swipe")
				}
			},
		}),
		[isSwipeEnabled],
	)
	return usePanGesture(swipeConfig)
}
