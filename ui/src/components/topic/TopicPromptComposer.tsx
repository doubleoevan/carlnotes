import { TOPIC_PROMPT_CHARS } from "@shared/contracts"
import { FileText, Paperclip, X } from "lucide-react"
import type * as React from "react"
import { useEffect, useRef, useState } from "react"
import { FileDropZone } from "@/components/common/FileDropZone"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ICON_BUTTON_CLASS } from "@/lib/styleClasses"
import { FILE_PICKER_ACCEPT } from "@/lib/utils"

// how tall the prompt box may grow before it scrolls
const MAX_PROMPT_BOX_HEIGHT_PX = 200

// what a long pasted text is named, so its chip and its uploaded file read the same
const PASTED_TEXT_FILENAME = "Pasted text.txt"

/**
 * The topic prompt box: staged attachment chips over a box that grows with the prompt, a paperclip, and a clear button.
 */
export function TopicPromptComposer({
	prompt,
	topicName,
	pendingFiles,
	onPromptChange,
	onAddFiles,
	onRemoveFile,
}: {
	prompt: string
	topicName: string
	pendingFiles: File[]
	onPromptChange: (prompt: string) => void
	onAddFiles: (files: File[]) => void
	onRemoveFile: (file: File) => void
}) {
	const promptBoxRef = useRef<HTMLTextAreaElement>(null)

	const placeholder = `Describe your topic.\n${topicName.trim() || "You know the one."}`

	// grow the box with the prompt and shrink it back when it is cleared
	useEffect(() => {
		const promptBox = promptBoxRef.current
		if (!promptBox) {
			return
		}
		promptBox.style.height = "auto"
		if (prompt !== "") {
			promptBox.style.height = `${Math.min(promptBox.scrollHeight, MAX_PROMPT_BOX_HEIGHT_PX)}px`
		}
	}, [prompt])

	// a pasted file attaches instead of pasting its name as text, and a copy-paste too long for a prompt becomes an attachment
	function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
		const pastedFiles = Array.from(event.clipboardData.files)
		if (pastedFiles.length > 0) {
			event.preventDefault()
			onAddFiles(pastedFiles)
			return
		}
		const pastedText = event.clipboardData.getData("text")
		if (prompt.length + pastedText.length > TOPIC_PROMPT_CHARS) {
			event.preventDefault()
			onAddFiles([new File([pastedText], PASTED_TEXT_FILENAME, { type: "text/plain" })])
		}
	}

	return (
		<FileDropZone
			onDropFiles={onAddFiles}
			className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 rounded-md border px-3 py-2.5 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]"
		>
			{/* what is staged shows as chips above the box, each is removable until Save uploads it */}
			{pendingFiles.length > 0 && <PendingAttachmentChips pendingFiles={pendingFiles} onRemoveFile={onRemoveFile} />}
			<div className="flex items-end gap-2">
				<AttachButton onSelect={onAddFiles} />
				<textarea
					ref={promptBoxRef}
					rows={2}
					value={prompt}
					onChange={(event) => onPromptChange(event.target.value)}
					onPaste={handlePaste}
					placeholder={placeholder}
					aria-label="Carl's prompt"
					className="placeholder:text-muted-foreground min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-relaxed outline-none sm:py-1 sm:text-sm"
				/>
				{/* a clear button wipes the box, and hands focus back, appearing only when there is something in the input */}
				{prompt !== "" && (
					<button
						type="button"
						aria-label="Clear prompt"
						onClick={() => {
							onPromptChange("")
							promptBoxRef.current?.focus()
						}}
						className={ICON_BUTTON_CLASS}
					>
						<X className="size-4" />
					</button>
				)}
			</div>
		</FileDropZone>
	)
}

// the paperclip and its hidden file picker. resetting the input's value lets the same file attach again
function AttachButton({ onSelect }: { onSelect: (files: File[]) => void }) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				accept={FILE_PICKER_ACCEPT}
				className="hidden"
				onChange={(event) => {
					onSelect(Array.from(event.target.files ?? []))
					event.target.value = ""
				}}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="Add files or photos"
						onClick={() => fileInputRef.current?.click()}
						className={ICON_BUTTON_CLASS}
					>
						<Paperclip className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent>Add files or photos</TooltipContent>
			</Tooltip>
		</>
	)
}

// the staged attachment files as removable chips. an image gets a thumbnail and everything else a named chip
function PendingAttachmentChips({
	pendingFiles,
	onRemoveFile,
}: {
	pendingFiles: File[]
	onRemoveFile: (file: File) => void
}) {
	return (
		<div className="mb-2 flex flex-wrap gap-1.5">
			{pendingFiles.map((file) => (
				<div key={toFileKey(file)} className="bg-muted flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-xs">
					{file.type.startsWith("image/") ? (
						<FilePreview file={file} />
					) : (
						<FileText className="text-muted-foreground size-3.5 shrink-0" />
					)}
					<span className="max-w-32 truncate">{file.name}</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={`Remove ${file.name}`}
								onClick={() => onRemoveFile(file)}
								className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center sm:size-4"
							>
								<X className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent>{`Remove ${file.name}`}</TooltipContent>
					</Tooltip>
				</div>
			))}
		</div>
	)
}

// a staged image's thumbnail, read from the file itself. the object url is released when the chip goes away
function FilePreview({ file }: { file: File }) {
	const [previewUrl, setPreviewUrl] = useState("")
	useEffect(() => {
		const objectUrl = URL.createObjectURL(file)
		setPreviewUrl(objectUrl)
		return () => URL.revokeObjectURL(objectUrl)
	}, [file])
	return <img src={previewUrl} alt={file.name} className="size-6 rounded object-cover" />
}

// a staged file's stable identity, matching the one the attachment editor dedupes on
function toFileKey(file: File): string {
	return `${file.name}-${file.size}-${file.lastModified}`
}
