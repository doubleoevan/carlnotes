// the web's Topic Post editor: the shared editor over the note's rich text input and toolbar, with the title at the top
// of the body's card and the word count and the button below
import {
	TopicPostEditor as SharedTopicPostEditor,
	type TopicPostEditorElements,
	type TopicPostEditorFooterProps,
	type TopicPostEditorLayoutProps,
	type TopicPostEditorProps,
	type TopicPostTitleInputProps,
} from "@carlnotes/core/components/TopicPostEditor"
import type { PickedBodyImage } from "@carlnotes/core/hooks/useTopicPostBodyImageUpload"
import { cn } from "@carlnotes/nightshift/classNames"
import { useEffect } from "react"
import { toast } from "sonner"
import { NoteInput } from "@/components/note/NoteEditor"
import { NoteToolbar } from "@/components/note/NoteToolbar"
import { CODE_BLOCK_COLORS_CLASS } from "@/components/note/noteStyle"
import { Button } from "@/components/primitives/button"
import { hasColoredCodeBlock, loadEditorCodeBlockColors } from "@/hooks/useCodeBlockColors"
import { TopicPostBodyControls } from "./TopicPostBodyControls"

// keep platform elements stable so typing never remounts the editor
const ELEMENTS: TopicPostEditorElements = {
	Layout: TopicPostEditorLayout,
	TitleInput: TopicPostTitleInput,
	Input: NoteInput,
	Toolbar: NoteToolbar,
	BodyControls: TopicPostBodyControls,
	Footer: TopicPostEditorFooter,
}

/**
 * Adapts the shared Topic Post editor to browser input and toast feedback.
 */
export function TopicPostEditor(props: Omit<TopicPostEditorProps, "onError">) {
	// a body that opens with a code block to color loads the highlighter that colors the editor's code blocks
	const { html } = props.topicPost
	useEffect(() => {
		if (hasColoredCodeBlock(html)) {
			loadEditorCodeBlockColors()
		}
	}, [html])
	return <SharedTopicPostEditor {...props} onError={toast.error} elements={ELEMENTS} appendImage={appendBodyImage} />
}

// a picked or pasted image's bytes, read from the local blob url its preview shows
async function appendBodyImage(body: FormData, image: PickedBodyImage): Promise<void> {
	const response = await fetch(image.uri)
	body.append("image", await response.blob())
}

// the toolbar, which stays at the top of the window while the post scrolls under it, then one page card with the
// title over a divider and the body under it, then the footer. a press on the body's area outside the text focuses
// the body
function TopicPostEditorLayout({ titleInput, toolbar, footer, editorRef, children }: TopicPostEditorLayoutProps) {
	return (
		<div className="flex flex-col gap-4 py-4">
			<div className="sticky top-2 z-20">{toolbar}</div>
			<div className="bg-card rounded-lg border shadow-raised">
				<div className="border-b px-4 py-4 sm:px-6">{titleInput}</div>
				<div
					onPointerDown={(event) => {
						if (!(event.target as HTMLElement).closest(".eti-editor")) {
							editorRef.current?.focus()
						}
					}}
					className={cn("min-h-80 py-4 sm:py-6", CODE_BLOCK_COLORS_CLASS)}
				>
					{children}
				</div>
			</div>
			{footer}
		</div>
	)
}

// the title in the display font at the top of the body's card, limited to the longest title, at a line height that
// holds the font's descenders
function TopicPostTitleInput({ value, label, placeholder, maxLength, onChange }: TopicPostTitleInputProps) {
	return (
		<input
			aria-label={label}
			value={value}
			placeholder={placeholder}
			maxLength={maxLength}
			onChange={(event) => onChange(event.target.value)}
			className="font-display text-card-foreground placeholder:text-muted-foreground w-full bg-transparent text-2xl leading-normal outline-none sm:text-3xl sm:leading-normal"
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
		<div className="flex flex-wrap items-center justify-between gap-3">
			<p className="text-muted-foreground text-sm" aria-live="polite">
				<span className={cn(!isComplete && "text-foreground font-medium")}>{wordCountLabel}</span>
				{` · ${saveStatusLabel}`}
			</p>
			<Button disabled={isActionDisabled} onClick={onAction}>
				{actionLabel}
			</Button>
		</div>
	)
}
