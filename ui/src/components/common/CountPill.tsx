import { cn } from "@/lib/utils"

// the largest count a pill shows as a number. anything past it reads as 9+
const LARGEST_SHOWN_COUNT = 9

/**
 * The badge count pill, filled for chat mentions or outlined for note updates.
 */
export function CountPill({
	count,
	variant = "filled",
	className,
}: {
	count: number
	variant?: "filled" | "outline"
	className?: string
}) {
	return (
		<span
			className={cn(
				"flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
				variant === "filled"
					? "bg-primary text-primary-foreground"
					: "border-primary text-primary bg-background border",
				className,
			)}
		>
			{count > LARGEST_SHOWN_COUNT ? "9+" : count}
		</span>
	)
}
