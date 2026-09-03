import type { TopicResponse } from "@shared/contracts"
import { ChevronRight, Download, ExternalLink, Paperclip, X } from "lucide-react"
import type * as React from "react"
import { useRef, useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Textarea } from "@/components/primitives/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ScrollNote } from "@/components/topic/TopicScanRecap"
import { FILE_PICKER_ACCEPT } from "@/lib/utils"

// one stored attachment, whose context the owner can read and correct
type StoredAttachment = TopicResponse["attachments"][number]

// the stored attachments, the staged files, and their change callbacks
type AttachmentEditorProps = {
	keptAttachments: TopicResponse["attachments"]
	pendingFiles: File[]
	onKeptChange: (attachments: TopicResponse["attachments"]) => void
	onPendingChange: (files: File[]) => void
}

/**
 * The attachments editor with the stored attachments, their context, the staged files, and the add link that stages more.
 */
export function TopicAttachmentEditor({
	keptAttachments,
	pendingFiles,
	onKeptChange,
	onPendingChange,
}: AttachmentEditorProps) {
	// the hidden file input that the add link opens
	const fileInputRef = useRef<HTMLInputElement>(null)

	// stage the attachment files to upload on Save
	const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>): void => {
		stageFiles(pendingFiles, Array.from(event.target.files ?? []), onPendingChange)
		event.target.value = ""
	}

	return (
		<div className="space-y-1.5">
			{/* one stored attachment per row, each name truncating to the row */}
			{keptAttachments.length > 0 && (
				<div className="flex flex-col gap-1.5">
					{keptAttachments.map((attachment) => (
						<AttachmentRow
							key={attachment.id}
							attachment={attachment}
							onRemove={() => onKeptChange(keptAttachments.filter((kept) => kept.id !== attachment.id))}
						>
							<AttachmentContext
								attachment={attachment}
								onContextChange={(context) =>
									onKeptChange(keptAttachments.map((kept) => (kept.id === attachment.id ? { ...kept, context } : kept)))
								}
							/>
						</AttachmentRow>
					))}
				</div>
			)}
			{/* one staged attachment per row, the section matches the prompt's chips. there isn't any context to show until the attachment is saved */}
			{pendingFiles.length > 0 && (
				<div className="flex flex-col gap-1.5">
					{pendingFiles.map((file) => (
						<PendingAttachmentRow
							key={toAttachmentFileKey(file)}
							file={file}
							onRemove={() => onPendingChange(pendingFiles.filter((pending) => pending !== file))}
						/>
					))}
				</div>
			)}

			{/* the add link and its hidden file input */}
			<button
				type="button"
				onClick={() => fileInputRef.current?.click()}
				className="text-link mt-2 flex items-center gap-1.5 text-sm hover:underline"
			>
				<Paperclip aria-hidden="true" className="size-3.5" />
				add an attachment
			</button>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				accept={FILE_PICKER_ACCEPT}
				onChange={handleFilesSelected}
				className="hidden"
			/>
		</div>
	)
}

// an attachment row with a ✕ remove button on the left, aligned with the add-an-attachment link below
function AttachmentRow({
	attachment,
	onRemove,
	children,
}: {
	attachment: StoredAttachment
	onRemove: () => void
	children?: React.ReactNode
}) {
	const label = attachment.sourceUrl ?? attachment.filename
	return (
		<div className="min-w-0 -ml-1 text-sm">
			<div className="flex min-w-0 items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={`Remove ${label}`}
							onClick={onRemove}
							className="text-muted-foreground hover:text-foreground shrink-0"
						>
							<X className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Delete attachment</TooltipContent>
				</Tooltip>
				<AttachmentLink attachment={attachment} />
			</div>
			{children}
		</div>
	)
}

// one staged attachment file's row with a delete button
function PendingAttachmentRow({ file, onRemove }: { file: File; onRemove: () => void }) {
	return (
		<div className="min-w-0 -ml-1 text-sm">
			<div className="flex min-w-0 items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={`Remove ${file.name}`}
							onClick={onRemove}
							className="text-muted-foreground hover:text-foreground shrink-0"
						>
							<X className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Delete attachment</TooltipContent>
				</Tooltip>
				<span className="text-muted-foreground min-w-0 truncate">{file.name}</span>
			</div>
		</div>
	)
}

// the row's name: a url links out to its page, and a file downloads
function AttachmentLink({ attachment }: { attachment: StoredAttachment }) {
	if (attachment.status === "failed") {
		return <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
	}

	// a pending attachment's page has been fetched but not screened, so it is not a link yet
	if (attachment.sourceUrl && attachment.status === "pending") {
		return <span className="min-w-0 flex-1 truncate">{attachment.sourceUrl}</span>
	}
	if (attachment.sourceUrl) {
		return (
			<AnchorLink
				href={attachment.sourceUrl}
				className="group text-link flex min-w-0 flex-1 items-center gap-1 hover:underline"
			>
				<span className="min-w-0 truncate">{attachment.sourceUrl}</span>
				<ExternalLink aria-hidden="true" className="size-3 shrink-0" />
			</AnchorLink>
		)
	}
	return (
		<a
			href={`/api/attachments/${attachment.id}/download`}
			download={attachment.filename}
			className="group text-link flex min-w-0 flex-1 items-center gap-1 hover:underline"
		>
			<span className="min-w-0 truncate">{attachment.filename}</span>
			<Download aria-hidden="true" className="size-3 shrink-0" />
		</a>
	)
}

// a stored attachment's context, rendered as the Markdown the model wrote it in
function AttachmentContext({
	attachment,
	onContextChange,
}: {
	attachment: StoredAttachment
	onContextChange: (context: string) => void
}) {
	const [isEditing, setIsEditing] = useState(false)

	// only a ready attachment has a settled context. anything else reports its status instead
	if (attachment.status !== "ready" || attachment.context === null) {
		const statusLabel =
			attachment.status === "pending" ? "Carl is still reading this one…" : "Carl couldn't read this one."
		return <div className="text-muted-foreground text-xs italic">{statusLabel}</div>
	}

	// a native <details> reveals a long context
	return (
		<details className="group">
			<summary className="text-link flex cursor-pointer list-none items-center gap-1.5 text-xs hover:underline [&::-webkit-details-marker]:hidden">
				<ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
				content
			</summary>
			{/* the attachment context is model-written, so reading it goes through the sanitizing renderer instead of raw markup */}
			{isEditing ? (
				<Textarea
					autoFocus
					value={attachment.context}
					onChange={(event) => onContextChange(event.target.value)}
					aria-label={`Context for ${attachment.sourceUrl ?? attachment.filename}`}
					className="mt-1 min-h-20 text-xs"
				/>
			) : (
				<div className="mt-1">
					<ScrollNote note={attachment.context} />
				</div>
			)}
			{/* "Edit" the attachment content with the link in the note or the button on the right */}
			<div className="mt-1 flex items-start justify-between gap-2">
				<p className="text-muted-foreground text-xs italic">
					{"What Carl read from the file. Every brew reads it. "}
					<button type="button" onClick={() => setIsEditing(!isEditing)} className="text-link hover:underline">
						Edit
					</button>
					{" wisely."}
				</p>
				<button
					type="button"
					onClick={() => setIsEditing(!isEditing)}
					className="text-link shrink-0 text-xs hover:underline"
				>
					{isEditing ? "done" : "edit"}
				</button>
			</div>
		</details>
	)
}

/**
 * A staged attachment file's stable identity for row keys and file deduping.
 */
export function toAttachmentFileKey(file: File): string {
	return `${file.name}-${file.size}-${file.lastModified}`
}

/**
 * Adds files to the staged list, skipping any already staged. Shared by the add link and by pasting into the topic prompt,
 * so both routes dedupe the same way.
 */
export function stageFiles(pendingFiles: File[], addedFiles: File[], onPendingChange: (files: File[]) => void): void {
	const stagedAttachmentKeys = new Set(pendingFiles.map(toAttachmentFileKey))
	const newFiles = addedFiles.filter((file) => !stagedAttachmentKeys.has(toAttachmentFileKey(file)))
	if (newFiles.length > 0) {
		onPendingChange([...pendingFiles, ...newFiles])
	}
}
