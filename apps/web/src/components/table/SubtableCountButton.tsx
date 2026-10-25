import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown } from "lucide-react"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

/**
 * The count that opens a subtable under its row: the number with a chevron that rotates while open and isn't shown at zero.
 * The accessible name ends with the count, so it includes the number that the button shows.
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
			aria-label={`${ariaLabel}, ${count}`}
			className={cn(
				STANDALONE_LINK_CLASS,
				"flex items-center gap-0.5 disabled:cursor-default disabled:no-underline disabled:opacity-50",
			)}
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
