import { type RefObject, useRef, useState } from "react"
import {
	applyNoteLink,
	type NoteEditorCommands,
	type NoteLink,
	type NoteSelection,
	toNoteLinkUrl,
} from "../lib/noteFormats"

// shared link state and actions consumed by the popover and native sheet
type NoteLinkControl = {
	isOpen: boolean
	url: string
	setUrl: (url: string) => void
	isOneParagraph: boolean
	linkLabel: string
	submitLabel: string
	canApply: boolean
	canRemove: boolean
	openUrl: string | null
	handleOpenChange: (isOpen: boolean) => void
	handleApplyLink: () => void
	handleRemoveLink: () => void
}

/**
 * Keeps a link's intended range while the platform URL control takes focus.
 */
export function useNoteLink({
	editorRef,
	selection,
	activeLink,
	isLinkActive,
}: {
	editorRef: RefObject<NoteEditorCommands | null>
	selection: NoteSelection
	activeLink: NoteLink | null
	isLinkActive: boolean
}): NoteLinkControl {
	// capture the selection when the link control opens
	const [isOpen, setIsOpen] = useState(false)
	const [url, setUrl] = useState("")
	const capturedRangeRef = useRef({ selection, activeLink: isLinkActive ? activeLink : null })
	const isOneParagraph = !selection.text.includes("\n")
	const linkLabel = isLinkActive ? "Edit link" : "Add link"

	// preserve the original link while focus moves to the URL input
	function handleOpenChange(nextIsOpen: boolean): void {
		if (nextIsOpen) {
			capturedRangeRef.current = { selection, activeLink: isLinkActive ? activeLink : null }
			setUrl(isLinkActive ? (activeLink?.url ?? "") : "")
		}
		setIsOpen(nextIsOpen)
	}

	// apply only valid URLs to the captured range
	function handleApplyLink(): void {
		if (applyNoteLink({ editor: editorRef.current, ...capturedRangeRef.current, url })) {
			setIsOpen(false)
		}
	}

	// keep the link's text while removing its destination
	function handleRemoveLink(): void {
		const capturedLink = capturedRangeRef.current.activeLink
		if (capturedLink) {
			editorRef.current?.removeLink(capturedLink.start, capturedLink.end)
		}
		setIsOpen(false)
	}

	return {
		isOpen,
		url,
		setUrl,
		isOneParagraph,
		linkLabel,
		submitLabel: capturedRangeRef.current.activeLink ? "Save" : "Add link",
		canApply: !capturedRangeRef.current.selection.text.includes("\n") && toNoteLinkUrl(url) !== null,
		canRemove: capturedRangeRef.current.activeLink !== null,
		openUrl: toNoteLinkUrl(capturedRangeRef.current.activeLink?.url ?? ""),
		handleOpenChange,
		handleApplyLink,
		handleRemoveLink,
	}
}
