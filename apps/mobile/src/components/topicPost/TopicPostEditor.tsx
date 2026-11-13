// the app's Topic Post editor: the shared editor over the note's rich text input and toolbar, with the title at the top
// of the body's card and the word count and the button below
import { appendNativeFilePart, showClientError } from "@carlnotes/client/apiClient"
import {
	TopicPostEditor as SharedTopicPostEditor,
	type TopicPostEditorElements,
	type TopicPostEditorFooterProps,
	type TopicPostEditorLayoutProps,
	type TopicPostEditorProps,
	type TopicPostTitleInputProps,
} from "@carlnotes/core/components/TopicPostEditor"
import type { PickedBodyImage } from "@carlnotes/core/hooks/useTopicPostBodyImageUpload"
import { toHtmlWithKeptAttributes } from "@carlnotes/core/lib/topicPostBodyHtml"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { TextInput, View } from "react-native"
import { NoteInput } from "@/components/note/NoteEditor"
import { NOTE_BODY_CARD_INSET, NoteBodyScroll, NoteKeyboardDoneButton } from "@/components/note/NoteLayout"
import { NoteToolbar } from "@/components/note/NoteToolbar"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { TopicPostBodyControls } from "./TopicPostBodyControls"

// the app's elements: the editor's screen layout, the title input, the note's own rich text input and toolbar, the
// Topic Post's own toolbar controls, and the footer with the save
const TOPIC_POST_EDITOR_ELEMENTS: TopicPostEditorElements = {
	Layout: TopicPostEditorLayout,
	TitleInput: TopicPostTitleInput,
	Input: NoteInput,
	Toolbar: NoteToolbar,
	BodyControls: TopicPostBodyControls,
	Footer: TopicPostEditorFooter,
}

/**
 * Adapts the shared Topic Post editor to the native input and the app's error notice. The native input draws an image
 * at its stored size, so the editor opens once the body's width is measured and shows each image no wider than it.
 */
export function TopicPostEditor(props: Omit<TopicPostEditorProps, "onError">) {
	const [editorWidth, setEditorWidth] = useState<number | null>(null)
	return (
		<View className="min-h-0 flex-1" onLayout={(event) => setEditorWidth(event.nativeEvent.layout.width)}>
			{editorWidth !== null && (
				<SharedTopicPostEditor
					{...props}
					onError={showClientError}
					elements={TOPIC_POST_EDITOR_ELEMENTS}
					appendImage={appendBodyImage}
					keepLostHtml={toHtmlWithKeptAttributes}
					imageWidthLimit={editorWidth - NOTE_BODY_CARD_INSET}
				/>
			)}
		</View>
	)
}

// a picked or pasted image as a native file part, read from its local uri
async function appendBodyImage(body: FormData, image: PickedBodyImage): Promise<void> {
	appendNativeFilePart(body, "image", { uri: image.uri, name: "image", type: image.type })
}

// the toolbar, then the bounded card with the title over a divider and the body under it, then the footer. an open
// keyboard hides the footer and shows its own dismissal
function TopicPostEditorLayout({ titleInput, toolbar, footer, editorRef, children }: TopicPostEditorLayoutProps) {
	const isKeyboardVisible = useIsKeyboardVisible()
	return (
		<View className="min-h-0 flex-1">
			<View className="pb-3">{toolbar}</View>
			<NoteBodyScroll header={titleInput}>{children}</NoteBodyScroll>
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
