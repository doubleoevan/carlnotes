import { cn } from "@carlnotes/nightshift/classNames"
import {
	type TakeawayRowContent,
	type TakeawaySkeletonProps,
	takeawaysListClasses,
	takeawaysSkeletonMetrics,
} from "@carlnotes/nightshift/components/takeaways-list"
import type { ReactNode } from "react"
import { DASHED_ROW_CLASS } from "@/lib/styleClasses"
import { RatingWithFeedbackSkeleton } from "./rating-with-feedback"

// match the space below the feedback field and compensate for the handwriting's visible inset
const TEXT_ROW_CLASS = "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 sm:gap-x-3"
const TOP_INSET_CLASS = "pt-1.5 sm:pt-0.5"
const NUMBER_CLASS = cn(takeawaysListClasses.text, TOP_INSET_CLASS, "text-muted-foreground")
const BODY_CLASS = cn(takeawaysListClasses.text, TOP_INSET_CLASS, "wrap-anywhere pb-1 antialiased")
const CONTENT_CLASS = "grid min-w-0"
const SKELETON_TOP_CLASS = "top-3.5 sm:top-2.5"
const SKELETON_FILL_CLASS = "bg-muted-foreground/20 motion-safe:animate-pulse"
const SKELETON_LINE_MASK = `repeating-linear-gradient(to bottom, #000 0 ${takeawaysSkeletonMetrics.barHeight}px, transparent ${takeawaysSkeletonMetrics.barHeight}px ${takeawaysSkeletonMetrics.lineHeight}px)`

/** Shows a page of takeaways or its loading placeholders inside the Nightshift card. */
export function TakeawaysList({ children, isLoading }: { children: ReactNode; isLoading: boolean }) {
	return (
		<ul aria-busy={isLoading} className={takeawaysListClasses.card}>
			{children}
		</ul>
	)
}

/** Aligns the takeaway and any feedback controls under the same number. */
export function TakeawayRow({
	text,
	itemNumber,
	children,
}: TakeawayRowContent & { text: string; children?: ReactNode }) {
	return (
		<li className={rowClass(Boolean(children))}>
			<div className={TEXT_ROW_CLASS}>
				<span className={NUMBER_CLASS}>{itemNumber}</span>
				<div className={CONTENT_CLASS}>
					<p className={BODY_CLASS}>{text}</p>
					{children}
				</div>
			</div>
		</li>
	)
}

/** Fills every line of the previous row without changing the pager position. */
export function TakeawaySkeleton({ text, itemNumber, canRate = false }: TakeawaySkeletonProps) {
	return (
		<li aria-hidden="true" className={rowClass(canRate)}>
			<div className={TEXT_ROW_CLASS}>
				{/* retain the number width so the previous text wraps exactly as it did while visible */}
				<div className="relative">
					<span className={cn(NUMBER_CLASS, "invisible")}>{itemNumber}</span>
					<div
						className={cn(
							takeawaysListClasses.skeletonBar,
							SKELETON_FILL_CLASS,
							SKELETON_TOP_CLASS,
							"absolute inset-x-0",
						)}
					/>
				</div>
				<div className={CONTENT_CLASS}>
					{/* repeat the line mask at the text's 26px line height so even long rows stay filled */}
					<div className="relative overflow-hidden">
						{text ? <p className={cn(BODY_CLASS, "invisible")}>{text}</p> : <div className="h-20" />}
						<div
							className={cn(SKELETON_FILL_CLASS, SKELETON_TOP_CLASS, "absolute inset-x-0 bottom-2")}
							style={{ maskImage: SKELETON_LINE_MASK }}
						/>
					</div>
					{canRate && <RatingWithFeedbackSkeleton />}
				</div>
			</div>
		</li>
	)
}

// reserve the same insets in the loaded row and its skeleton
function rowClass(canRate: boolean): string {
	return cn(
		DASHED_ROW_CLASS,
		takeawaysListClasses.row,
		canRate ? takeawaysListClasses.feedbackInset : takeawaysListClasses.readOnlyInset,
	)
}
