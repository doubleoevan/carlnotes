// the web's Topic Post editor: the shared editor over the note's rich text input and toolbar, with the title's input
// above them and the word count and the button below
import {
	TopicPostEditor as SharedTopicPostEditor,
	type TopicPostEditorElements,
	type TopicPostEditorFooterProps,
	type TopicPostEditorLayoutProps,
	type TopicPostEditorProps,
	type TopicPostTitleInputProps,
} from "@carlnotes/core/components/TopicPostEditor"
import { cn } from "@carlnotes/nightshift/classNames"
import { toast } from "sonner"
import { NoteConflictNotice } from "@/components/note/NoteConflictNotice"
import { NoteInput } from "@/components/note/NoteEditor"
import { NoteToolbar } from "@/components/note/NoteToolbar"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"

// keep platform elements stable so typing never remounts the editor
const ELEMENTS: TopicPostEditorElements = {
	Layout: TopicPostEditorLayout,
	TitleInput: TopicPostTitleInput,
	Input: NoteInput,
	Toolbar: NoteToolbar,
	ConflictNotice: NoteConflictNotice,
	Footer: TopicPostEditorFooter,
}

/**
 * Adapts the shared Topic Post editor to browser input and toast feedback.
 */
export function TopicPostEditor(props: Omit<TopicPostEditorProps, "onError">) {
	return <SharedTopicPostEditor {...props} onError={toast.error} elements={ELEMENTS} />
}

// the title over the toolbar, then the body on a page card, then the footer. a press on the card outside the body
// focuses the body
function TopicPostEditorLayout({
	titleInput,
	toolbar,
	conflict,
	footer,
	editorRef,
	children,
}: TopicPostEditorLayoutProps) {
	return (
		<div className="flex flex-col gap-4 py-4">
			{titleInput}
			{toolbar}
			{conflict}
			<div
				onPointerDown={(event) => {
					if (!(event.target as HTMLElement).closest(".eti-editor")) {
						editorRef.current?.focus()
					}
				}}
				className="bg-card min-h-80 rounded-lg border py-4 shadow-raised sm:py-6"
			>
				{children}
			</div>
			{footer}
		</div>
	)
}

// the title in the display font, limited to the longest title
function TopicPostTitleInput({ value, label, placeholder, maxLength, onChange }: TopicPostTitleInputProps) {
	return (
		<Input
			aria-label={label}
			value={value}
			placeholder={placeholder}
			maxLength={maxLength}
			onChange={(event) => onChange(event.target.value)}
			className="font-display h-auto py-2 text-2xl sm:text-3xl"
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
