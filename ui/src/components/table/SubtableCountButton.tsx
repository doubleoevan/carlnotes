import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The count that opens a subtable under its row: the number with a chevron that rotates while open and isn't shown at zero.
 */
export function SubtableCountButton({
	count,
	isOpen,
	ariaLabel,
	onClick,
}: {
	count: number
	isOpen: boolean
	ariaLabel: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={count === 0}
			aria-expanded={isOpen}
			aria-label={ariaLabel}
			className="text-link flex items-center gap-0.5 hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-50"
		>
			{count}
			{/* the chevron points down when the subtable is closed and rotates up when it opens */}
			{count > 0 && (
				<ChevronDown
					aria-hidden="true"
					className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-180")}
				/>
			)}
		</button>
	)
}
