import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"

// one colored share of the bar, as a percent of its width
type MeterSegment = { key: string; colorClass: string; widthPercent: number }

type MeterBarProps = {
	segments: MeterSegment[]
	// whether circles sit above the bar, which leaves room for them
	hasMarkers?: boolean
	// the MeterMarker circles over the bar
	children?: ReactNode
}

/**
 * Renders a meter's progress bar as its colored segments, with any MeterMarker circles above it.
 */
export function MeterBar({ segments, hasMarkers = false, children }: MeterBarProps) {
	return (
		<div className={cn("relative mt-2", hasMarkers && "pt-7.5")}>
			<div className="bg-muted flex h-3 overflow-hidden rounded-full">
				{segments.map(({ key, colorClass, widthPercent }) => (
					<div key={key} className={cn(colorClass, "h-full")} style={{ width: `${widthPercent}%` }} />
				))}
			</div>
			{children}
		</div>
	)
}
