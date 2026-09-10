import { cn } from "@/lib/utils"

// the largest count a badge shows as a number. anything past it reads as 9+
const LARGEST_SHOWN_COUNT = 9

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
			{count > LARGEST_SHOWN_COUNT ? "9+" : count}
		</span>
	)
}
