import type { NoteLayoutProps } from "@carlnotes/core/components/NoteStatic"
import { createContext, useContext, useState } from "react"
import { Keyboard as NativeKeyboard, ScrollView, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { toTypeRoleStyle } from "@/typeRoleStyles"
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
 * Keeps formatting below the title and comments below the scrolling body.
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
}: NoteLayoutProps) {
	// measure the remaining body space and show dismissal only for an open keyboard
	const [viewportHeight, setViewportHeight] = useState(300)
	const isKeyboardVisible = useIsKeyboardVisible()
	return (
		<View className="min-h-0 flex-1">
			{/* keep the title and formatting together above the body */}
			{header}
			{toolbar && <View className="pb-3">{toolbar}</View>}
			{/* scroll the bounded editor and comments within the remaining keyboard-safe space */}
			<ScrollView
				className="flex-1"
				keyboardShouldPersistTaps="handled"
				nestedScrollEnabled
				showsVerticalScrollIndicator
				onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
				contentContainerStyle={{ paddingBottom: 16 }}
			>
				{conflict}
				<EditorHeight.Provider value={Math.max(120, Math.min(440, viewportHeight - 32))}>
					<View className="rounded-lg border border-border bg-card px-4 py-4 shadow-raised">{children}</View>
				</EditorHeight.Provider>
				{isCommentsOpen && (
					<View className="mt-4 gap-2">
						<Text accessibilityRole="header" style={toTypeRoleStyle("sectionHeading")}>
							Comments
						</Text>
						<NoteComments {...noteCommentThread} canComment={canComment} />
					</View>
				)}
			</ScrollView>
			{/* keep keyboard dismissal separate from the full-width formatting toolbar */}
			{isKeyboardVisible && (
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
			)}
		</View>
	)
}
