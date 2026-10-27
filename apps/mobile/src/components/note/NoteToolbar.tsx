import {
	type NoteLinkControlProps,
	type NoteToolbarButtonProps,
	type NoteToolbarProps,
	NoteToolbar as SharedNoteToolbar,
} from "@carlnotes/core/components/NoteToolbar"
import { useNoteLink } from "@carlnotes/core/hooks/useNoteLink"
import type { NoteFormatKey } from "@carlnotes/core/lib/noteFormats"
import { cn } from "@carlnotes/nightshift/classNames"
import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import {
	Bold,
	Code,
	ExternalLink,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link,
	List,
	ListChecks,
	ListOrdered,
	type LucideIcon,
	SquareCode,
	Strikethrough,
	TextQuote,
	Underline,
	Unlink,
} from "lucide-react-native"
import { type PropsWithChildren, useRef, useState } from "react"
import { Animated, View } from "react-native"
import { openExternalLink } from "@/components/common/AnchorLink"
import { ScrollIndicator } from "@/components/common/ScrollIndicator"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// use the same symbols as the web for every shared formatting command
const ICONS: Record<NoteFormatKey, LucideIcon> = {
	bold: Bold,
	italic: Italic,
	underline: Underline,
	strikeThrough: Strikethrough,
	inlineCode: Code,
	h1: Heading1,
	h2: Heading2,
	h3: Heading3,
	unorderedList: List,
	orderedList: ListOrdered,
	checkboxList: ListChecks,
	blockQuote: TextQuote,
	codeBlock: SquareCode,
}
const ELEMENTS = {
	Container: ToolbarContainer,
	Divider: ToolbarDivider,
	Button: FormatButton,
	LinkControl: LinkControl,
}

/**
 * Draws the web's shared toolbar with native buttons and a selection-preserving link sheet.
 */
export function NoteToolbar(props: NoteToolbarProps) {
	return <SharedNoteToolbar {...props} elements={ELEMENTS} />
}

// keep focus in the editor and expose overflow with the same orange cue as scrollboxes
function ToolbarContainer({ children }: PropsWithChildren) {
	const scrollX = useRef(new Animated.Value(0)).current
	const [viewportWidth, setViewportWidth] = useState(0)
	const [contentWidth, setContentWidth] = useState(0)
	return (
		<View className="relative rounded-md border border-border bg-card shadow-raised">
			<Animated.ScrollView
				horizontal
				keyboardShouldPersistTaps="always"
				showsHorizontalScrollIndicator={false}
				accessibilityLabel="Formatting"
				onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
				onContentSizeChange={(width) => setContentWidth(width)}
				onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
				scrollEventThrottle={16}
				contentContainerStyle={{ alignItems: "center", padding: 4, paddingBottom: 10, gap: 4 }}
			>
				{children}
			</Animated.ScrollView>
			<ScrollIndicator scrollOffset={scrollX} viewportSize={viewportWidth} contentSize={contentWidth} isHorizontal />
		</View>
	)
}
function ToolbarDivider() {
	return <View className="mx-1 h-5 w-px bg-border" accessibilityElementsHidden />
}
function FormatButton({ label, stateKey, isPressed, isDisabled, onPress }: NoteToolbarButtonProps) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn("min-h-12 min-w-12", isPressed && "bg-accent")}
			accessibilityLabel={label}
			accessibilityState={{ selected: isPressed, disabled: isDisabled }}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon as={ICONS[stateKey]} className="size-4" />
		</Button>
	)
}

// capture the selected range before the URL field takes keyboard focus
function LinkControl(props: NoteLinkControlProps) {
	const link = useNoteLink(props)
	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className={cn("min-h-12 min-w-12", props.isLinkActive && "bg-accent")}
				accessibilityLabel={link.linkLabel}
				disabled={props.isLinkBlocked || !link.isOneParagraph}
				onPress={() => {
					link.handleOpenChange(true)
					props.editorRef.current?.blur?.()
				}}
			>
				<Icon as={Link} className="size-4" />
			</Button>
			{link.isOpen && (
				<Sheet title={link.linkLabel} onClose={() => link.handleOpenChange(false)}>
					<View className="gap-3">
						<BottomSheetTextInput
							accessibilityLabel="Link URL"
							value={link.url}
							onChangeText={link.setUrl}
							placeholder="https://"
							autoCapitalize="none"
							autoCorrect={false}
							keyboardType="url"
							style={toTypeRoleStyle("bodyLarge")}
							className="min-h-12 rounded-md border border-input bg-card px-3 py-2 text-foreground"
						/>
						<View className="flex-row flex-wrap justify-end gap-3">
							{link.canRemove && (
								<Button variant="ghost" accessibilityLabel="Remove link" onPress={link.handleRemoveLink}>
									<Icon as={Unlink} className="size-4" />
									<Text>Remove</Text>
								</Button>
							)}
							{link.openUrl && (
								<Button
									variant="ghost"
									accessibilityLabel="Open link"
									onPress={() => {
										if (link.openUrl) {
											void openExternalLink(link.openUrl)
										}
									}}
								>
									<Icon as={ExternalLink} className="size-4" />
									<Text>Open</Text>
								</Button>
							)}
							<Button accessibilityLabel={link.submitLabel} disabled={!link.canApply} onPress={link.handleApplyLink}>
								<Text>{link.submitLabel}</Text>
							</Button>
						</View>
					</View>
				</Sheet>
			)}
		</>
	)
}
