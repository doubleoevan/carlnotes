import type * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// the button's own look, a muted icon until hovered
const ICON_BUTTON_CLASS = "text-muted-foreground hover:text-foreground grid h-11 w-7 place-items-center sm:size-7"

/**
 * A button with an action tooltip, a muted icon until hovered unless className gives it another look. The tooltip is
 * the button's accessible name.
 */
export function IconButton({
	tooltip,
	ariaLabel,
	isDisabled,
	className = ICON_BUTTON_CLASS,
	onClick,
	children,
}: {
	tooltip: React.ReactNode
	// the plain-text name a markup tooltip cannot provide on its own
	ariaLabel?: string
	isDisabled?: boolean
	// the classes that replace the muted icon's look
	className?: string
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel ?? (typeof tooltip === "string" ? tooltip : undefined)}
					disabled={isDisabled}
					onClick={onClick}
					className={className}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}
