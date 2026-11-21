import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { useRevealClassName } from "@/hooks/useRevealClassName"

// the index of the last section in view when the page opens
const LAST_TOP_SECTION_INDEX = 2

/**
 * Plays the staggered hydrate animation as a section appears. A server-rendered page shows every section before any
 * script runs and animates only the top ones, and a page rendered in the browser reveals each section as it scrolls
 * into view.
 */
export function HydrateSection({ index, children }: { index: number; children: React.ReactNode }) {
	const { ref, revealClassName } = useRevealClassName<HTMLDivElement>({
		isAnimatedOnServer: index <= LAST_TOP_SECTION_INDEX,
	})
	return (
		<div
			ref={ref}
			data-reveal
			className={cn(revealClassName, "motion-reduce:animate-none motion-reduce:opacity-100")}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{children}
		</div>
	)
}
