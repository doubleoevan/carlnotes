import type * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

/**
 * An icon with an action tooltip, muted until hovered. The tooltip is the button's accessible name.
 */
export function IconButton({
	tooltip,
	ariaLabel,
	isPressed,
	onClick,
	children,
}: {
	tooltip: React.ReactNode
	// the plain-text name a markup tooltip cannot provide on its own
	ariaLabel?: string
	isPressed?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel ?? (typeof tooltip === "string" ? tooltip : undefined)}
					aria-pressed={isPressed}
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground grid h-11 w-7 place-items-center sm:size-7"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}
