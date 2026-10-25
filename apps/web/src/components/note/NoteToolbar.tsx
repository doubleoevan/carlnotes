// the note's formatting toolbar: the inline marks, the headings, the lists, the blocks, and the link, each lit from the
// editor's state and disabled while another active style blocks it
import { cn } from "@carlnotes/nightshift/classNames"
import {
	Bold,
	Code,
	ExternalLink,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link,
	List,
	ListChecks,
	ListOrdered,
	type LucideIcon,
	SquareCode,
	Strikethrough,
	TextQuote,
	Underline,
	Unlink,
} from "lucide-react"
import { type FormEvent, Fragment, type RefObject, useRef, useState } from "react"
import type {
	EnrichedTextInputInstance,
	OnChangeSelectionEvent,
	OnChangeStateEvent,
	OnLinkDetected,
} from "react-native-enriched-html"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { openInNewTab } from "@/lib/externalLinks"
import { MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"

// a style the toolbar toggles: its name, the state key it lights from, its icon, and the ref method it calls
type ToolbarControl = {
	label: string
	stateKey: Exclude<keyof OnChangeStateEvent, "alignment">
	Icon: LucideIcon
	toggle: (editor: EnrichedTextInputInstance) => void
}

// the controls in their groups: the inline marks, the headings, the lists, and the blocks
const TOOLBAR_GROUPS: ToolbarControl[][] = [
	[
		{ label: "Bold", stateKey: "bold", Icon: Bold, toggle: (editor) => editor.toggleBold() },
		{ label: "Italic", stateKey: "italic", Icon: Italic, toggle: (editor) => editor.toggleItalic() },
		{ label: "Underline", stateKey: "underline", Icon: Underline, toggle: (editor) => editor.toggleUnderline() },
		{
			label: "Strikethrough",
			stateKey: "strikeThrough",
			Icon: Strikethrough,
			toggle: (editor) => editor.toggleStrikeThrough(),
		},
		{ label: "Inline code", stateKey: "inlineCode", Icon: Code, toggle: (editor) => editor.toggleInlineCode() },
	],
	[
		{ label: "Heading 1", stateKey: "h1", Icon: Heading1, toggle: (editor) => editor.toggleH1() },
		{ label: "Heading 2", stateKey: "h2", Icon: Heading2, toggle: (editor) => editor.toggleH2() },
		{ label: "Heading 3", stateKey: "h3", Icon: Heading3, toggle: (editor) => editor.toggleH3() },
	],
	[
		{ label: "Bulleted list", stateKey: "unorderedList", Icon: List, toggle: (editor) => editor.toggleUnorderedList() },
		{
			label: "Numbered list",
			stateKey: "orderedList",
			Icon: ListOrdered,
			toggle: (editor) => editor.toggleOrderedList(),
		},
		{
			label: "Checklist",
			stateKey: "checkboxList",
			Icon: ListChecks,
			toggle: (editor) => editor.toggleCheckboxList(false),
		},
	],
	[
		{ label: "Quote", stateKey: "blockQuote", Icon: TextQuote, toggle: (editor) => editor.toggleBlockQuote() },
		{ label: "Code block", stateKey: "codeBlock", Icon: SquareCode, toggle: (editor) => editor.toggleCodeBlock() },
	],
]

/**
 * The toolbar above the note editor. Every control reads the editor's state and calls its ref.
 */
export function NoteToolbar({
	editorRef,
	formatState,
	selection,
	activeLink,
}: {
	editorRef: RefObject<EnrichedTextInputInstance | null>
	// the editor's style state, null before its first report
	formatState: OnChangeStateEvent | null
	// the current selection, and the link the caret last moved onto
	selection: OnChangeSelectionEvent
	activeLink: OnLinkDetected | null
}) {
	return (
		<div
			role="toolbar"
			aria-label="Formatting"
			className="bg-card scrollbar-none flex items-center gap-0.5 overflow-x-auto rounded-md border p-1 shadow-raised"
		>
			{TOOLBAR_GROUPS.map((group, groupIndex) => (
				<Fragment key={group[0]?.label}>
					{groupIndex > 0 && <ToolbarDivider />}
					{group.map((control) => {
						const styleState = formatState?.[control.stateKey]
						return (
							<ToolbarButton
								key={control.label}
								label={control.label}
								Icon={control.Icon}
								isPressed={styleState?.isActive ?? false}
								isDisabled={styleState?.isBlocking ?? false}
								onClick={() => editorRef.current && control.toggle(editorRef.current)}
							/>
						)
					})}
				</Fragment>
			))}
			<ToolbarDivider />
			<LinkControl
				editorRef={editorRef}
				isLinkActive={formatState?.link.isActive ?? false}
				isLinkBlocked={formatState?.link.isBlocking ?? false}
				selection={selection}
				activeLink={activeLink}
			/>
		</div>
	)
}

// the thin line between groups
function ToolbarDivider() {
	return <span className="bg-border mx-1 h-5 w-px shrink-0" aria-hidden="true" />
}

/**
 * One ghost icon button with its tooltip, lit while pressed. The mousedown is swallowed so an editor keeps its
 * selection through the press. The dialog's own controls use it too, with no pressed state.
 */
export function ToolbarButton({
	label,
	Icon,
	isPressed,
	isDisabled = false,
	className,
	onClick,
}: {
	label: string
	Icon: LucideIcon
	// whether the control is a toggle that is on. omitted, the control is a plain button
	isPressed?: boolean
	isDisabled?: boolean
	className?: string
	onClick: () => void
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={label}
					aria-pressed={isPressed}
					disabled={isDisabled}
					className={cn("shrink-0", isPressed && MENU_OPTION_SELECTED_CLASS, className)}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onClick}
				>
					<Icon className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

// the link control: a popover that puts a link over the selection, or edits, opens, or removes the one the caret sits in
function LinkControl({
	editorRef,
	isLinkActive,
	isLinkBlocked,
	selection,
	activeLink,
}: {
	editorRef: RefObject<EnrichedTextInputInstance | null>
	isLinkActive: boolean
	isLinkBlocked: boolean
	selection: OnChangeSelectionEvent
	activeLink: OnLinkDetected | null
}) {
	// the popover, and the url typed into it
	const [isOpen, setIsOpen] = useState(false)
	const [url, setUrl] = useState("")
	const urlInputRef = useRef<HTMLInputElement>(null)

	// a selection across paragraphs cannot take a link on this editor version
	const isOneParagraph = !selection.text.includes("\n")
	const label = isLinkActive ? "Edit link" : "Add link"

	// opening starts from the link under the caret, if there is one
	function handleOpenChange(nextIsOpen: boolean): void {
		setIsOpen(nextIsOpen)
		if (nextIsOpen) {
			setUrl(isLinkActive ? (activeLink?.url ?? "") : "")
		}
	}

	// the link the caret sits in keeps its range and text. a new one spans the selection, or inserts the url as its
	// own text
	function handleApplyLink(event: FormEvent): void {
		event.preventDefault()
		const editor = editorRef.current
		const linkUrl = toLinkUrl(url)
		if (!editor || !linkUrl) {
			return
		}
		if (isLinkActive && activeLink) {
			editor.setLink(activeLink.start, activeLink.end, activeLink.text, linkUrl)
		} else {
			editor.setLink(selection.start, selection.end, selection.text || linkUrl, linkUrl)
		}
		setIsOpen(false)
	}

	// the link's text stays, its href goes
	function handleRemoveLink(): void {
		if (activeLink) {
			editorRef.current?.removeLink(activeLink.start, activeLink.end)
		}
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
							aria-label={label}
							aria-pressed={isLinkActive}
							disabled={isLinkBlocked || !isOneParagraph}
							className={cn("shrink-0", isLinkActive && MENU_OPTION_SELECTED_CLASS)}
							onMouseDown={(event) => event.preventDefault()}
						>
							<Link className="size-4" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
			<PopoverContent
				className="w-80"
				align="start"
				onOpenAutoFocus={(event) => {
					// the url box takes the focus, not the popover itself
					event.preventDefault()
					urlInputRef.current?.focus()
				}}
			>
				<form className="flex flex-col gap-2" onSubmit={handleApplyLink}>
					<Input
						ref={urlInputRef}
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://"
						aria-label="Link URL"
						inputMode="url"
					/>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="submit" size="sm" disabled={!toLinkUrl(url)}>
							{isLinkActive ? "Save" : "Add link"}
						</Button>
						{isLinkActive && activeLink && (
							<>
								<Button type="button" size="sm" variant="ghost" onClick={handleRemoveLink}>
									<Unlink className="size-4" />
									Remove
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => openInNewTab(activeLink.url)}>
									<ExternalLink className="size-4" />
									Open
								</Button>
							</>
						)}
					</div>
				</form>
			</PopoverContent>
		</Popover>
	)
}

// the url a link takes: http, https, or mailto, with https put before a bare host, or null for anything else
function toLinkUrl(typedUrl: string): string | null {
	const trimmedUrl = typedUrl.trim()
	if (trimmedUrl.length === 0) {
		return null
	}

	// a bare host reads as https, so the url is http, https, or mailto or does not parse
	const urlWithScheme = /^(https?:\/\/|mailto:)/i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`
	try {
		return new URL(urlWithScheme).href
	} catch {
		return null
	}
}
