import { Paperclip } from "lucide-react"
import type * as React from "react"
import { useRef, useState } from "react"
import { cn } from "@/lib/utils"

// whether a drag includes files, so dragging selected text over a composer never opens the overlay
function hasDraggedFiles(event: React.DragEvent): boolean {
	return Array.from(event.dataTransfer.types).includes("Files")
}

/**
 * A container that attaches whatever files are dropped on it, showing an overlay while a file drag is over it.
 * Wraps a composer so the whole box is the target instead of the text area alone.
 */
export function FileDropZone({
	onDropFiles,
	className,
	children,
}: {
	onDropFiles: (files: File[]) => void
	className?: string
	children: React.ReactNode
}) {
	const [isDraggingFiles, setIsDraggingFiles] = useState(false)

	// the browser fires dragleave on this container the moment the pointer crosses into a child,
	// so the depth counter is what keeps the overlay up until the drag has actually left every level of it
	const dragDepth = useRef(0)

	const handleDragEnter = (event: React.DragEvent): void => {
		if (!hasDraggedFiles(event)) {
			return
		}
		dragDepth.current += 1
		setIsDraggingFiles(true)
	}

	const handleDragLeave = (event: React.DragEvent): void => {
		if (!hasDraggedFiles(event)) {
			return
		}
		dragDepth.current -= 1
		if (dragDepth.current <= 0) {
			dragDepth.current = 0
			setIsDraggingFiles(false)
		}
	}

	// a drag has to be taken here as well as on the drop, or the browser leaves the page to open the file
	const handleDragOver = (event: React.DragEvent): void => {
		if (hasDraggedFiles(event)) {
			event.preventDefault()
		}
	}

	const handleDrop = (event: React.DragEvent): void => {
		if (!hasDraggedFiles(event)) {
			return
		}
		event.preventDefault()
		dragDepth.current = 0
		setIsDraggingFiles(false)
		const droppedFiles = Array.from(event.dataTransfer.files)
		if (droppedFiles.length > 0) {
			onDropFiles(droppedFiles)
		}
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dropping is a pointer shortcut for the paperclip picker every composer already has
		<div
			className={cn("relative", className)}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{children}
			{/* the overlay covers the composer while a file is over it, so the whole box reads as the target */}
			{isDraggingFiles && (
				<div className="bg-background/90 border-primary text-primary pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-md border-2 border-dashed">
					<span className="flex items-center gap-2 text-sm font-medium">
						<Paperclip aria-hidden="true" className="size-4" />
						Drop to attach
					</span>
				</div>
			)}
		</div>
	)
}
