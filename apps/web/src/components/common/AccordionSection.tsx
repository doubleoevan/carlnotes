import { cn } from "@carlnotes/nightshift/classNames"
import type { LucideIcon } from "lucide-react"
import type { MouseEvent, ReactNode } from "react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { RAIL_TEXT_INSET, SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"

// the title's classes that let the count sit right after it from a screen width up, while the section is open: the
// title stops filling the row. a closed section keeps its count at the far right
const COUNT_BESIDE_TITLE_CLASSES = {
	sm: "sm:group-data-[state=open]:flex-none",
	lg: "lg:group-data-[state=open]:flex-none",
}

/**
 * One section of a page's accordion of sections, as every page draws them: the title in the display font with its
 * count at the far right, and a divider under the section only while it is closed.
 */
export function AccordionSection({
	value,
	title,
	icon: TitleIcon,
	countLabel,
	countBesideTitleFrom,
	titleAside,
	isContentKept,
	isLoading,
	onTriggerClick,
	children,
}: {
	// the accordion's own key for this section
	value: string
	title: string
	// the icon before the title
	icon?: LucideIcon
	// the section's count, such as "6 topics", or nothing until it is known
	countLabel?: string
	// the screen width from which the count sits right after the title instead of at the far right, for a section
	// whose content does not reach the far right
	countBesideTitleFrom?: keyof typeof COUNT_BESIDE_TITLE_CLASSES
	// what sits right of the title row, such as a button, where a click never opens or closes the section
	titleAside?: ReactNode
	// whether the content stays in the html while closed, for a crawler or for content that holds its own state
	isContentKept?: boolean
	// whether the section is a page's loading state, which shows a placeholder for its title and its count
	isLoading?: boolean
	onTriggerClick?: (event: MouseEvent<HTMLButtonElement>) => void
	children: ReactNode
}) {
	// the title with its count at the far right
	const trigger = (
		<AccordionTrigger
			onClick={onTriggerClick}
			disabled={isLoading}
			aria-label={isLoading ? "Loading" : undefined}
			className="group pb-1"
		>
			{/* the title, or its placeholder on the title's own line */}
			<span
				className={cn(
					"font-display flex flex-1 items-center gap-2 text-xl",
					countBesideTitleFrom && COUNT_BESIDE_TITLE_CLASSES[countBesideTitleFrom],
				)}
			>
				{!isLoading && TitleIcon && <TitleIcon aria-hidden="true" className="size-5 shrink-0" />}
				{isLoading ? <span className={cn(SKELETON_SHAPE_CLASS, "inline-block h-5 w-40 align-middle")} /> : title}
			</span>
			{/* the count, inset to end on the same line as the quota line above the Topics page's sections */}
			{isLoading ? (
				<span className={cn(SKELETON_SHAPE_CLASS, "h-4 w-16", RAIL_TEXT_INSET)} />
			) : (
				countLabel && <span className={cn("text-muted-foreground text-sm", RAIL_TEXT_INSET)}>{countLabel}</span>
			)}
		</AccordionTrigger>
	)
	return (
		<AccordionItem value={value}>
			{titleAside ? (
				<div className="flex items-center gap-2 [&>:first-child]:flex-1">
					{trigger}
					{titleAside}
				</div>
			) : (
				trigger
			)}
			<AccordionContent forceMount={isContentKept || undefined}>{children}</AccordionContent>
		</AccordionItem>
	)
}
