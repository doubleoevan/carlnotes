// the note's formatting toolbar: the inline marks, the headings, the lists, the blocks, and the link, each lit from the
// editor's state and disabled while another active style blocks it
import {
	type NoteLinkControlProps,
	type NoteToolbarButtonProps,
	type NoteToolbarProps,
	NoteToolbar as SharedNoteToolbar,
} from "@carlnotes/core/components/NoteToolbar"
import { useNoteLink } from "@carlnotes/core/hooks/useNoteLink"
import type { NoteFormatKey } from "@carlnotes/core/lib/noteFormats"
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
import { type FormEvent, type PropsWithChildren, useRef } from "react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { openInNewTab } from "@/lib/externalLinks"
import { MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"

// map the shared format keys to the web icon library
const FORMAT_ICONS: Record<NoteFormatKey, LucideIcon> = {
	bold: Bold,
	italic: Italic,
	underline: Underline,
	strikeThrough: Strikethrough,
	inlineCode: Code,
	h1: Heading1,
	h2: Heading2,
	h3: Heading3,
	unorderedList: List,
	orderedList: ListOrdered,
	checkboxList: ListChecks,
	blockQuote: TextQuote,
	codeBlock: SquareCode,
}

// stable adapters preserve the editor's selection as its format state changes
const TOOLBAR_ELEMENTS = { Container: ToolbarContainer, Divider: ToolbarDivider, Button: FormatButton, LinkControl }

/**
 * Renders the shared note toolbar with web buttons and a link popover.
 */
export function NoteToolbar(props: NoteToolbarProps) {
	return <SharedNoteToolbar {...props} elements={TOOLBAR_ELEMENTS} />
}

// retain the web's compact horizontally scrolling toolbar
function ToolbarContainer({ children }: PropsWithChildren) {
	return (
		<div
			role="toolbar"
			aria-label="Formatting"
			className="bg-card scrollbar-none flex items-center gap-0.5 overflow-x-auto rounded-md border p-1 shadow-raised"
		>
			{children}
		</div>
	)
}

// adapt the shared format button to the web's tooltip and focus behavior
function FormatButton({ stateKey, onPress, ...props }: NoteToolbarButtonProps) {
	return <ToolbarButton {...props} Icon={FORMAT_ICONS[stateKey]} onClick={onPress} />
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
function LinkControl({ editorRef, isLinkActive, isLinkBlocked, selection, activeLink }: NoteLinkControlProps) {
	// keep selection and link state shared while the popover manages browser focus
	const linkControl = useNoteLink({ editorRef, selection, activeLink, isLinkActive })
	const { isOpen, url, setUrl, isOneParagraph, linkLabel, handleOpenChange, handleRemoveLink } = linkControl
	const urlInputRef = useRef<HTMLInputElement>(null)

	// submit through the shared captured selection
	function handleApplyLink(event: FormEvent): void {
		event.preventDefault()
		linkControl.handleApplyLink()
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
							aria-label={linkLabel}
							aria-pressed={isLinkActive}
							disabled={isLinkBlocked || !isOneParagraph}
							className={cn("shrink-0", isLinkActive && MENU_OPTION_SELECTED_CLASS)}
							onMouseDown={(event) => event.preventDefault()}
						>
							<Link className="size-4" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{linkLabel}</TooltipContent>
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
						<Button type="submit" size="sm" disabled={!linkControl.canApply}>
							{linkControl.submitLabel}
						</Button>
						{linkControl.canRemove && (
							<>
								<Button type="button" size="sm" variant="ghost" onClick={handleRemoveLink}>
									<Unlink className="size-4" />
									Remove
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									disabled={!linkControl.openUrl}
									onClick={() => linkControl.openUrl && openInNewTab(linkControl.openUrl)}
								>
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
