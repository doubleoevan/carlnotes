import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"

// one colored share of the bar, as a percent of its width
type MeterSegment = { key: string; colorClass: string; widthPercent: number }

type MeterBarProps = {
	segments: MeterSegment[]
	// whether circles sit above the bar, which leaves room for them
	hasMarkers?: boolean
	// the amount a screen reader hears, if the bar reads as a progress bar
	progress?: { now: number; max: number; text: string }
	// the MeterMarker circles over the bar
	children?: ReactNode
}

/**
 * Renders a meter's progress bar as its colored segments, with any MeterMarker circles above it.
 */
export function MeterBar({ segments, hasMarkers = false, progress, children }: MeterBarProps) {
	// the progress bar's role and amount, if the bar has an amount to read
	const progressAttributes = progress
		? {
				role: "progressbar",
				"aria-valuemin": 0,
				"aria-valuenow": progress.now,
				"aria-valuemax": progress.max,
				"aria-valuetext": progress.text,
			}
		: {}
	return (
		<div className={cn("relative mt-2", hasMarkers && "pt-7.5")}>
			<div {...progressAttributes} className="bg-muted flex h-3 overflow-hidden rounded-full">
				{segments.map(({ key, colorClass, widthPercent }) => (
					<div key={key} className={cn(colorClass, "h-full")} style={{ width: `${widthPercent}%` }} />
				))}
			</div>
			{children}
		</div>
	)
}
