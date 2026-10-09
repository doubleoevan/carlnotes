import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { SCRIPTED_HIDDEN_CLASS, SCRIPTED_ONLY_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the toggle's size and inset, shared by the button and the link in its place
const MORE_TOGGLE_CLASS = "text-link mt-1 min-h-11 justify-start pl-9 text-sm sm:min-h-9"

/**
 * The more and less toggle under a card, shown with JavaScript alone. With fullListHref, a reader without JavaScript
 * gets a link to that page in the toggle's place.
 */
export function MoreButton({
	isExpanded,
	moreLabel,
	lessLabel = "show less ",
	fullListHref,
	onToggle,
	className,
}: {
	isExpanded: boolean
	moreLabel: string
	lessLabel?: string
	fullListHref?: string
	onToggle: () => void
	className?: string
}) {
	return (
		<>
			<Button
				variant="link"
				size="sm"
				onClick={onToggle}
				className={cn("group h-auto pr-0 hover:no-underline", MORE_TOGGLE_CLASS, SCRIPTED_ONLY_CLASS, className)}
			>
				{/* the label has the underline on hover, and the larger arrow stays outside it so the line stays flat */}
				<span className="underline-offset-4 group-hover:underline">{isExpanded ? lessLabel : moreLabel}</span>
				<span className="text-lg leading-none">{isExpanded ? "▴" : "▾"}</span>
			</Button>
			{/* the link a reader without JavaScript follows in the toggle's place */}
			{fullListHref && (
				<AnchorLink
					href={fullListHref}
					className={cn("flex items-center hover:underline", MORE_TOGGLE_CLASS, SCRIPTED_HIDDEN_CLASS, className)}
				>
					{moreLabel}
				</AnchorLink>
			)}
		</>
	)
}
