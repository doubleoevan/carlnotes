import { Button } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

/**
 * The more and less toggle under a card.
 */
export function MoreButton({
	isExpanded,
	moreLabel,
	lessLabel = "show less ",
	onToggle,
	className,
}: {
	isExpanded: boolean
	moreLabel: string
	lessLabel?: string
	onToggle: () => void
	className?: string
}) {
	return (
		<Button
			variant="link"
			size="sm"
			onClick={onToggle}
			className={cn(
				"group text-link mt-1 h-auto min-h-11 justify-start pr-0 pl-9 hover:no-underline sm:min-h-9",
				className,
			)}
		>
			{/* the label has the underline on hover, and the larger arrow stays outside it so the line stays flat */}
			<span className="underline-offset-4 group-hover:underline">{isExpanded ? lessLabel : moreLabel}</span>
			<span className="text-lg leading-none">{isExpanded ? "▴" : "▾"}</span>
		</Button>
	)
}
