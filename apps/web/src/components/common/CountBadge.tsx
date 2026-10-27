import { toCountBadgeLabel } from "@carlnotes/core/lib/noteBadges"
import { cn } from "@carlnotes/nightshift/classNames"

/**
 * Shows the count every badge alert uses.
 */
export function CountBadge({ count, className }: { count: number; className?: string }) {
	return (
		<span
			className={cn(
				"bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
				className,
			)}
		>
			{toCountBadgeLabel(count)}
		</span>
	)
}
