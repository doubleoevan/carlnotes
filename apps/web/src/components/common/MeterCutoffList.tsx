import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"

// one cutoff under a meter: where it sits as text or an input, what it stops, and whether the meter passed it
type MeterCutoffRow = { key: string; label: ReactNode; line: string; isPassed: boolean }

/**
 * Renders the list under a meter of what each cutoff stops. A passed line is struck through.
 */
export function MeterCutoffList({ cutoffRows }: { cutoffRows: MeterCutoffRow[] }) {
	return (
		<ul className="text-muted-foreground mt-3 space-y-1 text-xs">
			{cutoffRows.map((cutoffRow) => (
				<li key={cutoffRow.key} className="flex items-baseline gap-2">
					<span className={cn("min-w-10 shrink-0 tabular-nums", !cutoffRow.isPassed && "text-foreground font-medium")}>
						{cutoffRow.label}
					</span>
					<span className={cn(cutoffRow.isPassed && "line-through")}>{cutoffRow.line}</span>
				</li>
			))}
		</ul>
	)
}
