// a Topic Post's editor: its title over the rich text editor a note has, with the word count and the button that
// publishes a draft or leaves a published post's edit
import { publishTopicPost, type saveTopicPost } from "@carlnotes/client/topicPostClient"
import {
	isTopicPostComplete,
	TOPIC_POST_TITLE_MAX_CHARS,
	type TopicPostResponse,
} from "@carlnotes/contracts/topicPosts"
import { type ComponentType, type PropsWithChildren, type ReactNode, type RefObject, useRef, useState } from "react"
import { type RichTextEditorInputProps, useRichTextEditor } from "../hooks/useRichTextEditor"
import { type PickedBodyImage, useTopicPostBodyImageUpload } from "../hooks/useTopicPostBodyImageUpload"
import { useTopicPostSave } from "../hooks/useTopicPostSave"
import type { NoteFormatState } from "../lib/noteFormats"
import { NOTE_SAVE_STATUS_LABELS } from "../lib/noteLabels"
import {
	toApiBodyImageHtml,
	toBlockImageHtml,
	toBodyImageSizes,
	toSiteBodyImageHtml,
	toStoredSizeImageHtml,
	toWidthLimitedImageHtml,
} from "../lib/topicPostBodyHtml"
import {
	TOPIC_POST_LABELS,
	toTopicPostFailureMessage,
	toTopicPostWordCount,
	toTopicPostWordCountLabel,
} from "../lib/topicPosts"
import type { NoteToolbarProps } from "./NoteToolbar"
import type { NoteEditorInstance } from "./NoteViewer"

// the post, what a publish and a published post's last save do, and how a failure is shown
export type TopicPostEditorProps = {
	topicPost: TopicPostResponse
	onPublished: (topicPost: TopicPostResponse) => void
	onDone: () => void
	onError: (message: string) => void
	// the save request. a story passes a fake
	saveTopicPostDraft?: typeof saveTopicPost
}

// the controls only a Topic Post's toolbar has: the Image button with the uploads on their way, the alignment of the
// paragraphs at the caret or of the selected image, the code block's language while the caret is in one, and the
// selected image's alt text
export type TopicPostBodyControlsProps = {
	editorRef: RefObject<NoteEditorInstance | null>
	formatState: NoteFormatState | null
	previewUris: string[]
	isImageBlocked: boolean
	onPickImages: (images: PickedBodyImage[]) => void
	codeBlockLanguage: string | null
	isCodeBlockActive: boolean
	// the selected image's alt text, or null while no image is selected
	imageAlt: string | null
}

// where each app places the editor's parts: the title, the toolbar, the body, and the footer
export type TopicPostEditorLayoutProps = PropsWithChildren<{
	titleInput: ReactNode
	toolbar: ReactNode
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

// each app's elements: the layout, the title's input, the rich text input and toolbar a note has, the Topic Post's own
// toolbar controls, and the footer
export type TopicPostEditorElements = {
	Layout: ComponentType<TopicPostEditorLayoutProps>
	TitleInput: ComponentType<TopicPostTitleInputProps>
	Input: ComponentType<RichTextEditorInputProps>
	Toolbar: ComponentType<NoteToolbarProps>
	BodyControls: ComponentType<TopicPostBodyControlsProps>
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
	saveTopicPostDraft,
	appendImage,
	keepLostHtml,
	imageWidthLimit,
	elements: { Layout, TitleInput, Input, Toolbar, BodyControls, Footer },
}: TopicPostEditorProps & {
	elements: TopicPostEditorElements
	// how the platform puts a local image's bytes in an upload's form
	appendImage: (body: FormData, image: PickedBodyImage) => Promise<void>
	// what a platform's editor drops from the body, put back from the body before the edit
	keepLostHtml?: (previousHtml: string, editedHtml: string) => string
	// the widest a platform's editor that draws an image at its stored size shows one. a save puts the stored size back
	imageWidthLimit?: number
}) {
	// the body the editor opened on, with each image on its own line, its word count, and whether the button's work is
	// on its way
	const [initialHtml] = useState(() => toEditorHtml(topicPost.html, imageWidthLimit))
	const [wordCount, setWordCount] = useState(topicPost.wordCount)
	const [isActing, setIsActing] = useState(false)

	// the save
	const topicPostSave = useTopicPostSave({
		topicPost,
		saveTopicPostDraft,
		onSaveError: (topicPostWriteFailure) =>
			onError(toTopicPostFailureMessage(topicPostWriteFailure, TOPIC_POST_LABELS.saveError)),
	})

	// the body as last kept at its site paths, from which a platform's editor's losses come back, and each image's
	// stored size by its path, which a save puts back over the size an editor with an image width limit shows
	const previousHtmlRef = useRef(topicPost.html)
	const storedImageSizesRef = useRef(toBodyImageSizes(topicPost.html))
	const keepEditedHtml = (editedHtml: string): string => {
		const siteHtml = imageWidthLimit
			? toStoredSizeImageHtml(toSiteBodyImageHtml(editedHtml), storedImageSizesRef.current)
			: toSiteBodyImageHtml(editedHtml)
		previousHtmlRef.current = keepLostHtml ? keepLostHtml(previousHtmlRef.current, siteHtml) : siteHtml
		return previousHtmlRef.current
	}

	// the editor, whose own rendering of the stored body is the saved one
	const { editorRef, toolbarProps, inputProps } = useRichTextEditor({
		initialHtml,
		onBaselineHtml: (html) => topicPostSave.setSavedHtml(keepEditedHtml(html)),
		onChangeHtml: (editedHtml) => {
			const html = keepEditedHtml(editedHtml)
			setWordCount(toTopicPostWordCount(html))
			topicPostSave.scheduleHtml(html)
		},
	})
	const { formatState } = toolbarProps

	// the body's image uploads, from the Image button and from a paste
	const bodyImageUpload = useTopicPostBodyImageUpload({
		topicPostId: topicPost.id,
		editorRef,
		selection: toolbarProps.selection,
		appendImage,
		onError,
		imageWidthLimit,
		onImageStored: (path, size) => storedImageSizesRef.current.set(path, size),
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
			toolbar={
				<Toolbar {...toolbarProps}>
					<BodyControls
						editorRef={editorRef}
						formatState={formatState}
						previewUris={bodyImageUpload.previewUris}
						isImageBlocked={formatState?.image?.isBlocking ?? false}
						onPickImages={bodyImageUpload.uploadImages}
						codeBlockLanguage={formatState?.codeBlock?.language ?? null}
						isCodeBlockActive={formatState?.codeBlock?.isActive ?? false}
						imageAlt={formatState?.image?.isActive ? (formatState.image.alt ?? "") : null}
					/>
				</Toolbar>
			}
			footer={
				<Footer
					wordCountLabel={toTopicPostWordCountLabel(wordCount)}
					isComplete={isComplete}
					saveStatusLabel={NOTE_SAVE_STATUS_LABELS[topicPostSave.status]}
					actionLabel={toActionLabel(isPublished, isActing)}
					isActionDisabled={isActing || !isComplete}
					onAction={() => void handleAction()}
				/>
			}
		>
			<Input
				{...inputProps}
				placeholder={TOPIC_POST_LABELS.bodyPlaceholder}
				onPasteImages={bodyImageUpload.uploadImages}
			/>
		</Layout>
	)
}

// a stored body as the editor opens it: each image on its own line, at the api's origin, and no wider than the
// editor's image width limit if it has one
function toEditorHtml(html: string, imageWidthLimit: number | undefined): string {
	const editorHtml = toBlockImageHtml(toApiBodyImageHtml(html))
	return imageWidthLimit ? toWidthLimitedImageHtml(editorHtml, imageWidthLimit) : editorHtml
}

// the button's label: Done on a published post, and Publish on a draft, or Publishing while the publish is on its way
function toActionLabel(isPublished: boolean, isActing: boolean): string {
	if (isPublished) {
		return TOPIC_POST_LABELS.done
	}
	return isActing ? TOPIC_POST_LABELS.publishing : TOPIC_POST_LABELS.publish
}
