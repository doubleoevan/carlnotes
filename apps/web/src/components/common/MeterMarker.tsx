import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

type MeterMarkerProps = {
	// where the circle sits, as a percent of the bar's width
	percent: number
	// the short text inside the circle, which widens into a pill for a long one, and the name a screen reader hears
	label: string
	ariaLabel: string
	// a passed circle fades, and a moving one has a dashed edge
	isPassed: boolean
	isMoving?: boolean
	// the tooltip's content
	children: ReactNode
}

/**
 * Renders one circle above a MeterBar, with its line down to the bar's bottom edge and a tooltip.
 */
export function MeterMarker({ percent, label, ariaLabel, isPassed, isMoving = false, children }: MeterMarkerProps) {
	return (
		<div
			className="absolute top-0 bottom-0 flex -translate-x-1/2 flex-col items-center"
			style={{ left: `${percent}%` }}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={ariaLabel}
						className={cn(
							"border-foreground bg-card text-foreground grid h-6.5 min-w-6.5 shrink-0 place-items-center rounded-full border-[1.5px] px-1 text-[9px] font-semibold tabular-nums whitespace-nowrap",
							isMoving && "border-dashed",
							isPassed && "bg-muted border-muted-foreground/50 text-muted-foreground",
						)}
					>
						{label}
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-60">{children}</TooltipContent>
			</Tooltip>
			<div className={cn("bg-foreground -mt-px w-0.5 flex-1", isPassed ? "opacity-35" : "opacity-75")} />
		</div>
	)
}
