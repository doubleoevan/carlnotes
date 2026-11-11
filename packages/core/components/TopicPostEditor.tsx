// a Topic Post's editor: its title over the rich text editor a note has, with the word count and the button that
// publishes a draft or leaves a published post's edit
import { fetchTopicPost, publishTopicPost, type saveTopicPost } from "@carlnotes/client/topicPostClient"
import {
	isTopicPostComplete,
	TOPIC_POST_TITLE_MAX_CHARS,
	type TopicPostResponse,
} from "@carlnotes/contracts/topicPosts"
import { type ComponentType, type PropsWithChildren, type ReactNode, type RefObject, useState } from "react"
import { type RichTextEditorInputProps, useRichTextEditor } from "../hooks/useRichTextEditor"
import { useTopicPostSave } from "../hooks/useTopicPostSave"
import { NOTE_SAVE_STATUS_LABELS } from "../lib/noteLabels"
import {
	TOPIC_POST_LABELS,
	toTopicPostFailureMessage,
	toTopicPostWordCount,
	toTopicPostWordCountLabel,
} from "../lib/topicPosts"
import type { NoteConflictNoticeProps } from "./NoteConflictNotice"
import type { NoteToolbarProps } from "./NoteToolbar"
import type { NoteEditorInstance } from "./NoteViewer"

// the post, what a publish and a published post's last save do, and how a failure is shown
export type TopicPostEditorProps = {
	topicPost: TopicPostResponse
	onPublished: (topicPost: TopicPostResponse) => void
	onDone: () => void
	onError: (message: string) => void
	// the save request. a story passes a fake
	saveDraft?: typeof saveTopicPost
}

// where each app places the editor's parts: the title, the toolbar, the conflict notice, the body, and the footer
export type TopicPostEditorLayoutProps = PropsWithChildren<{
	titleInput: ReactNode
	toolbar: ReactNode
	conflict: ReactNode
	footer: ReactNode
	editorRef: RefObject<NoteEditorInstance | null>
}>

// the title's input, limited to the longest title
export type TopicPostTitleInputProps = {
	value: string
	label: string
	placeholder: string
	maxLength: number
	onChange: (title: string) => void
}

// the footer: the word count, whether it meets the minimum, where the save stands, and the publish or done button
export type TopicPostEditorFooterProps = {
	wordCountLabel: string
	isComplete: boolean
	saveStatusLabel: string
	actionLabel: string
	isActionDisabled: boolean
	onAction: () => void
}

// each app's elements: the layout, the title's input, the rich text input and toolbar a note has, the conflict notice,
// and the footer
export type TopicPostEditorElements = {
	Layout: ComponentType<TopicPostEditorLayoutProps>
	TitleInput: ComponentType<TopicPostTitleInputProps>
	Input: ComponentType<RichTextEditorInputProps>
	Toolbar: ComponentType<NoteToolbarProps>
	ConflictNotice: ComponentType<NoteConflictNoticeProps>
	Footer: ComponentType<TopicPostEditorFooterProps>
}

/**
 * Edits a Topic Post's title and body with a save as its author types, counts its words, and publishes a draft once
 * it has a title and the fewest words. A published post's editor closes on Done.
 */
export function TopicPostEditor({
	topicPost,
	onPublished,
	onDone,
	onError,
	saveDraft,
	elements: { Layout, TitleInput, Input, Toolbar, ConflictNotice, Footer },
}: TopicPostEditorProps & { elements: TopicPostEditorElements }) {
	// the body the editor opened on, its word count, and whether the button's work or a reload is on its way
	const [initialHtml] = useState(topicPost.html)
	const [wordCount, setWordCount] = useState(topicPost.wordCount)
	const [isActing, setIsActing] = useState(false)
	const [isReloading, setIsReloading] = useState(false)

	// the save, and the editor that feeds it. the editor's own rendering of the stored body is the saved one
	const topicPostSave = useTopicPostSave({
		topicPost,
		saveDraft,
		onSaveError: (topicPostWriteFailure) =>
			onError(toTopicPostFailureMessage(topicPostWriteFailure, TOPIC_POST_LABELS.saveError)),
	})
	const { editorRef, toolbarProps, inputProps, setHtml } = useRichTextEditor({
		initialHtml,
		onBaselineHtml: topicPostSave.setSavedHtml,
		onChangeHtml: (html) => {
			setWordCount(toTopicPostWordCount(html))
			topicPostSave.scheduleHtml(html)
		},
	})
	const isPublished = topicPost.publishedAt !== null
	const isComplete = isTopicPostComplete(topicPostSave.title, wordCount)

	// save what waits, then publish a draft or leave a published post's editor. a failed save keeps the editor open
	async function handleAction(): Promise<void> {
		setIsActing(true)
		try {
			if (!(await topicPostSave.saveNow())) {
				return
			}
			if (isPublished) {
				onDone()
				return
			}

			// the publish returns the post as its readers see it, or why it stayed a draft
			const topicPostWriteResult = await publishTopicPost(topicPost.id)
			if (topicPostWriteResult.status === "saved") {
				onPublished(topicPostWriteResult.topicPost)
			} else {
				onError(toTopicPostFailureMessage(topicPostWriteResult, TOPIC_POST_LABELS.publishError))
			}
		} finally {
			setIsActing(false)
		}
	}

	// replace the draft with the stored post only after a deliberate reload returns it
	async function handleReload(): Promise<void> {
		setIsReloading(true)
		try {
			const storedTopicPost = await fetchTopicPost(topicPost.id)
			if (!storedTopicPost?.isEditable) {
				onError(TOPIC_POST_LABELS.lockedError)
				return
			}
			topicPostSave.resolveConflict(storedTopicPost)
			setWordCount(storedTopicPost.wordCount)
			setHtml(storedTopicPost.html)
		} catch {
			onError(TOPIC_POST_LABELS.reloadError)
		} finally {
			setIsReloading(false)
		}
	}
	return (
		<Layout
			editorRef={editorRef}
			titleInput={
				<TitleInput
					value={topicPostSave.title}
					label={TOPIC_POST_LABELS.titleLabel}
					placeholder={TOPIC_POST_LABELS.titlePlaceholder}
					maxLength={TOPIC_POST_TITLE_MAX_CHARS}
					onChange={topicPostSave.setTitle}
				/>
			}
			toolbar={<Toolbar {...toolbarProps} />}
			conflict={
				topicPostSave.hasConflict ? (
					<ConflictNotice
						message={TOPIC_POST_LABELS.conflict}
						lastEditorUsername={null}
						isReloading={isReloading}
						onReload={() => void handleReload()}
					/>
				) : null
			}
			footer={
				<Footer
					wordCountLabel={toTopicPostWordCountLabel(wordCount)}
					isComplete={isComplete}
					saveStatusLabel={NOTE_SAVE_STATUS_LABELS[topicPostSave.status]}
					actionLabel={toActionLabel(isPublished, isActing)}
					isActionDisabled={isActing || topicPostSave.hasConflict || !isComplete}
					onAction={() => void handleAction()}
				/>
			}
		>
			<Input {...inputProps} placeholder={TOPIC_POST_LABELS.bodyPlaceholder} />
		</Layout>
	)
}

// the button's label: Done on a published post, and Publish on a draft, or Publishing while the publish is on its way
function toActionLabel(isPublished: boolean, isActing: boolean): string {
	if (isPublished) {
		return TOPIC_POST_LABELS.done
	}
	return isActing ? TOPIC_POST_LABELS.publishing : TOPIC_POST_LABELS.publish
}
