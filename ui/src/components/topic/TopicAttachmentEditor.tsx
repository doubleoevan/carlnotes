import type { TopicResponse } from "@shared/contracts"
import { X } from "lucide-react"
import type * as React from "react"
import { useRef, useState } from "react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Textarea } from "@/components/primitives/textarea"

// one stored attachment, whose context the owner can read and correct
type KeptAttachment = TopicResponse["attachments"][number]

// the stored attachments, the staged files and urls, and their change callbacks
type AttachmentEditorProps = {
	keptAttachments: TopicResponse["attachments"]
	pendingFiles: File[]
	pendingUrls: string[]
	onKeptChange: (attachments: TopicResponse["attachments"]) => void
	onPendingChange: (files: File[]) => void
	onPendingUrlsChange: (urls: string[]) => void
}

/**
 * The attachments editor with the stored attachments and their remove or add buttons
 */
export function TopicAttachmentEditor({
	keptAttachments,
	pendingFiles,
	pendingUrls,
	onKeptChange,
	onPendingChange,
	onPendingUrlsChange,
}: AttachmentEditorProps) {
	// the hidden file input, and the add-url form state
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [isAddingUrl, setIsAddingUrl] = useState(false)
	const [urlValue, setUrlValue] = useState("")

	// stage the attachment files to upload on Save
	const handleFilesPicked = (event: React.ChangeEvent<HTMLInputElement>): void => {
		const stagedKeys = new Set(pendingFiles.map(toFileKey))
		const pickedFiles = Array.from(event.target.files ?? []).filter((file) => !stagedKeys.has(toFileKey(file)))
		onPendingChange([...pendingFiles, ...pickedFiles])
		event.target.value = ""
	}

	// stage a url to ingest on Save
	const handleAddUrl = (): void => {
		const url = urlValue.trim()
		if (url && !pendingUrls.includes(url)) {
			onPendingUrlsChange([...pendingUrls, url])
		}
		setUrlValue("")
		setIsAddingUrl(false)
	}

	// clear the url form on cancel
	const handleCancelUrl = (): void => {
		setUrlValue("")
		setIsAddingUrl(false)
	}

	// kept or staged attachments render above the "add" controls
	const hasAttachments = keptAttachments.length > 0 || pendingFiles.length > 0 || pendingUrls.length > 0
	return (
		<div className="space-y-1.5">
			{/* one attachment per row, kept then staged. a url shows its url, a file its name, each truncating to the row */}
			{hasAttachments && (
				<div className="flex flex-col gap-1.5">
					{keptAttachments.map((attachment) => (
						<AttachmentRow
							key={attachment.id}
							label={attachment.sourceUrl ?? attachment.filename}
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
					{pendingFiles.map((file) => (
						<AttachmentRow
							key={toFileKey(file)}
							label={file.name}
							onRemove={() => onPendingChange(pendingFiles.filter((pending) => pending !== file))}
						/>
					))}
					{pendingUrls.map((url) => (
						<AttachmentRow
							key={url}
							label={url}
							onRemove={() => onPendingUrlsChange(pendingUrls.filter((pending) => pending !== url))}
						/>
					))}
				</div>
			)}
			{/* the "add" controls: upload a file with its hidden input and add url below */}
			<div className="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className="text-link text-sm hover:underline"
				>
					+ upload
				</button>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept="text/*,application/pdf,.md,.txt,.pdf"
					onChange={handleFilesPicked}
					className="hidden"
				/>
				{/* the add url form revealed on click */}
				{isAddingUrl ? (
					<div className="flex w-full gap-2">
						<Input
							autoFocus
							type="url"
							placeholder="page url…"
							value={urlValue}
							onChange={(event) => setUrlValue(event.target.value)}
							onKeyDown={(event) => event.key === "Enter" && handleAddUrl()}
						/>
						<Button variant="outline" onClick={handleAddUrl}>
							Add
						</Button>
						<Button variant="ghost" onClick={handleCancelUrl}>
							Cancel
						</Button>
					</div>
				) : (
					<button
						type="button"
						onClick={() => setIsAddingUrl(true)}
						className="text-link w-full text-left text-sm hover:underline"
					>
						+ add url
					</button>
				)}
			</div>
		</div>
	)
}

// an attachment row with a ✕ remove control on the left, aligned with the + add controls below.
// children hold whatever belongs under the row, which for a stored attachment is its context
function AttachmentRow({
	label,
	onRemove,
	children,
}: {
	label: string
	onRemove: () => void
	children?: React.ReactNode
}) {
	return (
		<div className="min-w-0 -ml-1 text-sm">
			<div className="flex min-w-0 items-center gap-1.5">
				<button
					type="button"
					aria-label={`Remove ${label}`}
					onClick={onRemove}
					className="text-muted-foreground hover:text-foreground shrink-0"
				>
					<X className="size-3.5" />
				</button>
				<span className="min-w-0 flex-1 truncate">{label}</span>
			</div>
			{children}
		</div>
	)
}

// a stored attachment's context. it is editable because every later scan for the topic reads it, so this is where
// the owner corrects what the model made of the file. a native <details> hides a long one with no state to track
function AttachmentContext({
	attachment,
	onContextChange,
}: {
	attachment: KeptAttachment
	onContextChange: (context: string) => void
}) {
	// only a ready attachment has a settled context. anything else reports its status instead
	if (attachment.status !== "ready" || attachment.context === null) {
		const statusLabel =
			attachment.status === "pending" ? "Carl is still reading this one…" : "Carl couldn't read this one."
		return <div className="text-muted-foreground pl-5 text-xs italic">{statusLabel}</div>
	}

	return (
		<details className="pl-5">
			<summary className="text-link cursor-pointer text-xs hover:underline">context</summary>
			<Textarea
				value={attachment.context}
				onChange={(event) => onContextChange(event.target.value)}
				aria-label={`Context for ${attachment.sourceUrl ?? attachment.filename}`}
				className="mt-1 min-h-20 text-xs"
			/>
			<p className="text-muted-foreground mt-1 text-xs italic">
				What Carl made of this file. Every later scan reads it, so edits stick.
			</p>
		</details>
	)
}

// a staged attachment file's stable identity for row key and file deduping
function toFileKey(file: File): string {
	return `${file.name}-${file.size}-${file.lastModified}`
}
