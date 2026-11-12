// the app's Topic Post editor: the shared editor over the note's rich text input and toolbar, with the title at the top
// of the body's card and the word count and the button below
import { showClientError } from "@carlnotes/client/apiClient"
import {
	TopicPostEditor as SharedTopicPostEditor,
	type TopicPostEditorElements,
	type TopicPostEditorFooterProps,
	type TopicPostEditorLayoutProps,
	type TopicPostEditorProps,
	type TopicPostTitleInputProps,
} from "@carlnotes/core/components/TopicPostEditor"
import { cn } from "@carlnotes/nightshift/classNames"
import { TextInput, View } from "react-native"
import { NoteConflictNotice } from "@/components/note/NoteConflictNotice"
import { NoteInput } from "@/components/note/NoteEditor"
import { NoteBodyScroll, NoteKeyboardDoneButton } from "@/components/note/NoteLayout"
import { NoteToolbar } from "@/components/note/NoteToolbar"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"

// the app's elements: the editor's screen layout, the title input, the note's own rich text input and toolbar, the
// conflict notice, and the footer with the save
const TOPIC_POST_EDITOR_ELEMENTS: TopicPostEditorElements = {
	Layout: TopicPostEditorLayout,
	TitleInput: TopicPostTitleInput,
	Input: NoteInput,
	Toolbar: NoteToolbar,
	ConflictNotice: NoteConflictNotice,
	Footer: TopicPostEditorFooter,
}

/**
 * Adapts the shared Topic Post editor to the native input and the app's error notice.
 */
export function TopicPostEditor(props: Omit<TopicPostEditorProps, "onError">) {
	return <SharedTopicPostEditor {...props} onError={showClientError} elements={TOPIC_POST_EDITOR_ELEMENTS} />
}

// the toolbar, then the bounded card with the title over a divider and the body under it, then the footer. an open
// keyboard hides the footer and shows its own dismissal
function TopicPostEditorLayout({
	titleInput,
	toolbar,
	conflict,
	footer,
	editorRef,
	children,
}: TopicPostEditorLayoutProps) {
	const isKeyboardVisible = useIsKeyboardVisible()
	return (
		<View className="min-h-0 flex-1">
			<View className="pb-3">{toolbar}</View>
			<NoteBodyScroll notice={conflict} header={titleInput}>
				{children}
			</NoteBodyScroll>
			{!isKeyboardVisible && footer}
			<NoteKeyboardDoneButton editorRef={editorRef} />
		</View>
	)
}

// the title in the display font at the top of the body's card, limited to the longest title
function TopicPostTitleInput({ value, label, placeholder, maxLength, onChange }: TopicPostTitleInputProps) {
	return (
		<TextInput
			accessibilityLabel={label}
			value={value}
			placeholder={placeholder}
			maxLength={maxLength}
			onChangeText={onChange}
			allowFontScaling
			multiline
			className="min-h-12 p-0 font-display text-2xl text-card-foreground"
		/>
	)
}

// the word count and where the save stands at the left, and the button at the right
function TopicPostEditorFooter({
	wordCountLabel,
	isComplete,
	saveStatusLabel,
	actionLabel,
	isActionDisabled,
	onAction,
}: TopicPostEditorFooterProps) {
	return (
		<View className="flex-row flex-wrap items-center justify-between gap-3 pt-2">
			<Text accessibilityLiveRegion="polite" className="shrink text-sm text-muted-foreground">
				<Text className={cn("text-sm", isComplete ? "text-muted-foreground" : "font-medium text-foreground")}>
					{wordCountLabel}
				</Text>
				{` · ${saveStatusLabel}`}
			</Text>
			<Button accessibilityLabel={actionLabel} disabled={isActionDisabled} onPress={onAction}>
				<Text>{actionLabel}</Text>
			</Button>
		</View>
	)
}
