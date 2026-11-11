import type { NoteLayoutProps } from "@carlnotes/core/components/NoteViewer"
import { createContext, type ReactNode, useContext, useState } from "react"
import { Keyboard as NativeKeyboard, ScrollView, View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { NoteComments } from "./NoteComments"

// the measured viewport bounds native caret scrolling below the toolbar
const EditorHeight = createContext(240)

/**
 * Returns the bounded editor height inside the screen's keyboard-adjusted viewport.
 */
export function useNoteEditorHeight(): number {
	return useContext(EditorHeight)
}

/**
 * Keeps formatting below the title and opens comments in the phone's own sheet.
 */
export function NoteLayout({
	children,
	header,
	toolbar,
	conflict,
	editorRef,
	noteCommentThread,
	canComment,
	isCommentsOpen,
	onCloseComments,
}: NoteLayoutProps) {
	return (
		<View className="min-h-0 flex-1">
			{/* keep the title and formatting together above the body */}
			{header}
			{toolbar && <View className="pb-3">{toolbar}</View>}
			<NoteBodyScroll notice={conflict}>{children}</NoteBodyScroll>
			{/* expose the complete thread above the editor with the web phone's sheet behavior */}
			{isCommentsOpen && (
				<Sheet title="Comments" onClose={() => onCloseComments?.()} hasHighlightedScrollIndicator>
					<NoteComments {...noteCommentThread} canComment={canComment} isInSheet />
				</Sheet>
			)}
			<NoteKeyboardDoneButton editorRef={editorRef} />
		</View>
	)
}

/**
 * Scrolls the bounded body card within the remaining keyboard-safe space, under the notice above it.
 */
export function NoteBodyScroll({ notice, children }: { notice?: ReactNode; children: ReactNode }) {
	// measure the remaining body space
	const [viewportHeight, setViewportHeight] = useState(300)
	return (
		<ScrollView
			className="flex-1"
			keyboardShouldPersistTaps="handled"
			nestedScrollEnabled
			showsVerticalScrollIndicator
			onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
			contentContainerStyle={{ paddingBottom: 16 }}
		>
			{notice}
			<EditorHeight.Provider value={Math.max(120, Math.min(440, viewportHeight - 32))}>
				<View className="rounded-lg border border-border bg-card px-4 py-4 shadow-raised">{children}</View>
			</EditorHeight.Provider>
		</ScrollView>
	)
}

/**
 * Shows the keyboard's dismissal apart from the full-width formatting toolbar, only for an open keyboard.
 */
export function NoteKeyboardDoneButton({ editorRef }: Pick<NoteLayoutProps, "editorRef">) {
	const isKeyboardVisible = useIsKeyboardVisible()
	if (!isKeyboardVisible) {
		return null
	}
	return (
		<Button
			accessibilityLabel="Hide keyboard"
			variant="ghost"
			size="sm"
			className="self-end"
			onPress={() => {
				// dismiss either the rich editor or the comment composer's keyboard
				editorRef?.current?.blur()
				NativeKeyboard.dismiss()
			}}
		>
			<Text>Done</Text>
		</Button>
	)
}
