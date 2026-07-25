import type { TopicResponse } from "@shared/contracts"
import { X } from "lucide-react"
import type * as React from "react"
import { useRef, useState } from "react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"

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
export function AttachmentEditor({
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
	const handleFilesPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
		const stagedKeys = new Set(pendingFiles.map(toFileKey))
		const pickedFiles = Array.from(event.target.files ?? []).filter((file) => !stagedKeys.has(toFileKey(file)))
		onPendingChange([...pendingFiles, ...pickedFiles])
		event.target.value = ""
	}

	// stage a url to ingest on Save
	const handleAddUrl = () => {
		const url = urlValue.trim()
		if (url && !pendingUrls.includes(url)) {
			onPendingUrlsChange([...pendingUrls, url])
		}
		setUrlValue("")
		setIsAddingUrl(false)
	}

	// clear the url form on cancel
	const handleCancelUrl = () => {
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
						/>
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

// an attachment row with a ✕ remove control on the left, aligned with the + add controls below
function AttachmentRow({ label, onRemove }: { label: string; onRemove: () => void }) {
	return (
		<div className="flex min-w-0 -ml-1 items-center gap-1.5 text-sm">
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
	)
}

// a staged attachment file's stable identity for row key and file deduping
function toFileKey(file: File): string {
	return `${file.name}-${file.size}-${file.lastModified}`
}
