// a Dashboard title that may be cut off, with its full title in the shadcn tooltip on a hover or keyboard focus, only
// if it is cut off
import { type ReactElement, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

/**
 * Wraps one element that draws a title cut off with an ellipsis, showing the full title in the tooltip if it is cut
 * off.
 */
export function TitleTooltip({ title, children }: { title: string; children: ReactElement }) {
	// the trigger is the wrapped element, a button or a span, read only for its widths. the tooltip's trigger types its
	// ref as a button's
	const triggerRef = useRef<HTMLButtonElement>(null)
	const [isOpen, setIsOpen] = useState(false)

	// open only while the title's text runs past its box
	const handleOpenChange = (nextIsOpen: boolean): void => {
		const trigger = triggerRef.current
		setIsOpen(nextIsOpen && !!trigger && trigger.scrollWidth > trigger.clientWidth)
	}
	return (
		<Tooltip open={isOpen} onOpenChange={handleOpenChange}>
			<TooltipTrigger asChild ref={triggerRef}>
				{children}
			</TooltipTrigger>
			<TooltipContent>{title}</TooltipContent>
		</Tooltip>
	)
}
