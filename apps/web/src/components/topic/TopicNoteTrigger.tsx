import { cn } from "@carlnotes/nightshift/classNames"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// the hint above every control that opens a Topic note
export const TOPIC_NOTE_TOOLTIP = "A topic note from Carl"

/**
 * The note icon that opens a Topic's note, inside the Popover that holds the note. A caller that opens the hint from
 * the heading around the icon passes the tooltip's own open state.
 */
export function TopicNoteTrigger({
	className,
	isHintOpen,
	onHintOpenChange,
}: {
	className?: string
	isHintOpen?: boolean
	onHintOpenChange?: (isHintOpen: boolean) => void
}) {
	return (
		<Tooltip open={isHintOpen} onOpenChange={onHintOpenChange}>
			<TooltipTrigger asChild>
				{/* a click on the icon stays on the icon, and never reaches the row or heading that holds it */}
				<PopoverTrigger
					onClick={(event) => event.stopPropagation()}
					className={cn("shrink-0 hover:opacity-75", className)}
					aria-label="Topic details"
				>
					<NoteIcon />
				</PopoverTrigger>
			</TooltipTrigger>
			<TooltipContent side="top">{TOPIC_NOTE_TOOLTIP}</TooltipContent>
		</Tooltip>
	)
}
