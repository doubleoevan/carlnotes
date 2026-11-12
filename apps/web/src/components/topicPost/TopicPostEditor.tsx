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
import { cn } from "@carlnotes/nightshift/classNames"
import { toast } from "sonner"
import { NoteConflictNotice } from "@/components/note/NoteConflictNotice"
import { NoteInput } from "@/components/note/NoteEditor"
import { NoteToolbar } from "@/components/note/NoteToolbar"
import { Button } from "@/components/primitives/button"

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

// the toolbar, then one page card with the title over a divider and the body under it, then the footer. a press on
// the body's area outside the text focuses the body
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
			{toolbar}
			{conflict}
			<div className="bg-card rounded-lg border shadow-raised">
				<div className="border-b px-4 py-4 sm:px-6">{titleInput}</div>
				<div
					onPointerDown={(event) => {
						if (!(event.target as HTMLElement).closest(".eti-editor")) {
							editorRef.current?.focus()
						}
					}}
					className="min-h-80 py-4 sm:py-6"
				>
					{children}
				</div>
			</div>
			{footer}
		</div>
	)
}

// the title in the display font at the top of the body's card, limited to the longest title
function TopicPostTitleInput({ value, label, placeholder, maxLength, onChange }: TopicPostTitleInputProps) {
	return (
		<input
			aria-label={label}
			value={value}
			placeholder={placeholder}
			maxLength={maxLength}
			onChange={(event) => onChange(event.target.value)}
			className="font-display text-card-foreground placeholder:text-muted-foreground w-full bg-transparent text-2xl outline-none sm:text-3xl"
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
