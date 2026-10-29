import { toCountBadgeLabel } from "@carlnotes/core/lib/noteBadges"
import { cn } from "@carlnotes/nightshift/classNames"
import { Text } from "@/components/primitives/text"

/**
 * Returns the count badge's classes: the web's pill, filled, or outlined for an unread note badge.
 */
export function toCountBadgeClassName(isOutline: boolean): string {
	return cn(
		"min-w-4 rounded-full px-1 text-center text-[10px] font-semibold",
		isOutline ? "border border-primary text-link" : "bg-primary text-primary-foreground",
	)
}

/**
 * Shows the count every badge alert uses, abbreviated past nine.
 */
export function CountBadge({ count, className }: { count: number; className?: string }) {
	return <Text className={cn(toCountBadgeClassName(false), className)}>{toCountBadgeLabel(count)}</Text>
}
