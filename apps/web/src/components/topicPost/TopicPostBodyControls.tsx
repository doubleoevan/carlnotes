// the controls only a Topic Post's toolbar has: the Image button with each upload's preview and spinner, the alignment
// of the paragraphs at the caret or of the selected image, the code block's language while the caret is in one, and
// the selected image's alt text

import { TOPIC_POST_BODY_IMAGE_ACCEPT } from "@carlnotes/contracts/attachmentTypes"
import type { TopicPostAlign } from "@carlnotes/contracts/topicPostBodyImages"
import { TOPIC_POST_BODY_IMAGE_ALT_MAX_CHARS } from "@carlnotes/contracts/topicPostBodyImages"
import {
	AUTO_LANGUAGE_LABEL,
	CODE_BLOCK_LANGUAGES,
	PLAIN_TEXT_LABEL,
	PLAIN_TEXT_LANGUAGE,
} from "@carlnotes/contracts/topicPosts"
import type { TopicPostBodyControlsProps } from "@carlnotes/core/components/TopicPostEditor"
import {
	alignTopicPostBody,
	TOPIC_POST_ALIGN_OPTIONS,
	toActiveTopicPostAlign,
} from "@carlnotes/core/lib/topicPostAlignment"
import { TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import { AlignCenter, AlignLeft, AlignRight, Captions, ImagePlus, Loader2, type LucideIcon } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { ToolbarButton } from "@/components/note/NoteToolbar"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { loadEditorCodeBlockColors } from "@/hooks/useCodeBlockColors"

// the menu's value for a code block with no language, whose language is guessed, because a select option cannot be
// empty
const AUTO_LANGUAGE_VALUE = "auto"

// each alignment button's icon
const ALIGN_ICONS: Record<TopicPostAlign, LucideIcon> = {
	left: AlignLeft,
	center: AlignCenter,
	right: AlignRight,
}

/**
 * Renders the Image button, the uploads on their way, the alignment buttons, the code block's language menu, and the
 * image's alt text.
 */
export function TopicPostBodyControls({
	editorRef,
	formatState,
	previewUris,
	isImageBlocked,
	onPickImages,
	codeBlockLanguage,
	isCodeBlockActive,
	imageAlt,
}: TopicPostBodyControlsProps) {
	// the hidden file input the Image button opens
	const fileInputRef = useRef<HTMLInputElement>(null)

	// the caret in a code block loads the highlighter that colors the editor's code blocks
	useEffect(() => {
		if (isCodeBlockActive) {
			loadEditorCodeBlockColors()
		}
	}, [isCodeBlockActive])

	// the chosen files go up by local urls their previews show
	function handleFilesChosen(files: FileList | null): void {
		const images = [...(files ?? [])].map((file) => ({ uri: URL.createObjectURL(file), type: file.type }))
		if (images.length > 0) {
			onPickImages(images)
		}
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}

	return (
		<>
			{/* the Image button and its hidden file input */}
			<ToolbarButton
				label={TOPIC_POST_LABELS.addImage}
				Icon={ImagePlus}
				isDisabled={isImageBlocked}
				onClick={() => fileInputRef.current?.click()}
			/>
			<input
				ref={fileInputRef}
				type="file"
				accept={TOPIC_POST_BODY_IMAGE_ACCEPT.join(",")}
				multiple
				hidden
				onChange={(event) => handleFilesChosen(event.target.files)}
			/>

			{/* each upload's preview under a spinner until it lands or fails */}
			{previewUris.map((previewUri) => (
				<span key={previewUri} className="relative size-8 shrink-0 overflow-hidden rounded-sm border">
					<img src={previewUri} alt="" className="size-full object-cover opacity-60" />
					<Loader2 className="text-foreground absolute inset-0 m-auto size-4 animate-spin" />
					<span className="sr-only" role="status">
						{TOPIC_POST_LABELS.imageUploading}
					</span>
				</span>
			))}

			{/* the alignment of the paragraphs at the caret or of the selected image */}
			{TOPIC_POST_ALIGN_OPTIONS.map(({ align, label }) => (
				<ToolbarButton
					key={align}
					label={label}
					Icon={ALIGN_ICONS[align]}
					isPressed={toActiveTopicPostAlign(formatState) === align}
					onClick={() => editorRef.current && alignTopicPostBody(editorRef.current, formatState, align)}
				/>
			))}

			{/* the code block's language while the caret is in one */}
			{isCodeBlockActive && (
				<Select
					value={codeBlockLanguage ?? AUTO_LANGUAGE_VALUE}
					onValueChange={(value) =>
						editorRef.current?.setCodeBlockLanguage?.(value === AUTO_LANGUAGE_VALUE ? null : value)
					}
				>
					<SelectTrigger size="sm" aria-label={TOPIC_POST_LABELS.codeBlockLanguage} className="shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={AUTO_LANGUAGE_VALUE}>{AUTO_LANGUAGE_LABEL}</SelectItem>
						<SelectItem value={PLAIN_TEXT_LANGUAGE}>{PLAIN_TEXT_LABEL}</SelectItem>
						{CODE_BLOCK_LANGUAGES.map((language) => (
							<SelectItem key={language.value} value={language.value}>
								{language.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{/* the selected image's alt text */}
			{imageAlt !== null && <ImageAltControl editorRef={editorRef} imageAlt={imageAlt} />}
		</>
	)
}

// a popover with the selected image's alt text, saved to the image on submit
function ImageAltControl({
	editorRef,
	imageAlt,
}: Pick<TopicPostBodyControlsProps, "editorRef"> & { imageAlt: string }) {
	const [isOpen, setIsOpen] = useState(false)
	const [alt, setAlt] = useState(imageAlt)

	// open with the image's current alt text
	function handleOpenChange(isOpening: boolean): void {
		setAlt(imageAlt)
		setIsOpen(isOpening)
	}

	// save the alt text to the image and close
	function handleSaveAlt(event: FormEvent): void {
		event.preventDefault()
		editorRef.current?.setImageAlt?.(alt.trim())
		setIsOpen(false)
	}

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={TOPIC_POST_LABELS.imageAlt}
							className="shrink-0"
							onMouseDown={(event) => event.preventDefault()}
						>
							<Captions className="size-4" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{TOPIC_POST_LABELS.imageAlt}</TooltipContent>
			</Tooltip>
			<PopoverContent className="w-80" align="start">
				<form className="flex flex-col gap-2" onSubmit={handleSaveAlt}>
					<Input
						value={alt}
						onChange={(event) => setAlt(event.target.value)}
						placeholder={TOPIC_POST_LABELS.imageAltPlaceholder}
						aria-label={TOPIC_POST_LABELS.imageAlt}
						maxLength={TOPIC_POST_BODY_IMAGE_ALT_MAX_CHARS}
					/>
					<Button type="submit" size="sm" className="self-start">
						Save
					</Button>
				</form>
			</PopoverContent>
		</Popover>
	)
}
