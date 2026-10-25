import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { CARD_CLASS } from "@/lib/styleClasses"

/**
 * The raised card every table sits in: the surface, the border, and the horizontal scroll a
 * narrow screen needs. Each table adds only its page's spacing.
 */
export function TableCard({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div data-slot="table-card" className={cn(CARD_CLASS, className)}>
			{children}
		</div>
	)
}
