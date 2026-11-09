import { type MoreButtonComponents, MoreButton as SharedMoreButton } from "@carlnotes/core/components/MoreButton"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { SCRIPTED_HIDDEN_CLASS, SCRIPTED_ONLY_CLASS } from "@/lib/styleClasses"

// the toggle's size and inset, shared by the button and the link in its place. the inset centers the + under the
// column of rank numbers, which narrows from sm up
const MORE_TOGGLE_CLASS = "text-link mt-1 min-h-11 justify-start pl-5.75 text-sm sm:min-h-9 sm:pl-4.25"

// a toggle right under a card gives back the touch room below its label, so what follows starts as far below the
// label as it would start below the card
export const MORE_UNDER_CARD_CLASS = "-mb-3.5 sm:-mb-2.5"

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
			<SharedMoreButton
				isExpanded={isExpanded}
				moreLabel={moreLabel}
				lessLabel={lessLabel}
				onToggle={onToggle}
				className={className}
				components={MORE_BUTTON_COMPONENTS}
			/>
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

// browser hover styling leaves the arrow outside the label's underline. the button is a block like the link in its
// place
const MORE_BUTTON_COMPONENTS: MoreButtonComponents = {
	Button: ({ onPress, isExpanded, className, children }) => (
		<Button
			variant="link"
			size="sm"
			onClick={onPress}
			aria-expanded={isExpanded}
			className={cn(
				"group h-auto pr-0 hover:no-underline",
				MORE_TOGGLE_CLASS,
				SCRIPTED_ONLY_CLASS,
				"w-fit scripted:flex",
				className,
			)}
		>
			{children}
		</Button>
	),
	Label: ({ children }) => <span className="underline-offset-4 group-hover:underline">{children}</span>,
	Arrow: ({ children }) => <span className="text-lg leading-none">{children}</span>,
}
