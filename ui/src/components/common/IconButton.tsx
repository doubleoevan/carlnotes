import type * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

/**
 * An icon with an action tooltip, muted until hovered. The tooltip is the button's accessible name,
 * since the icon has no text of its own.
 */
export function IconButton({
	tooltip,
	isPressed,
	onClick,
	children,
}: {
	tooltip: string
	isPressed?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={tooltip}
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
