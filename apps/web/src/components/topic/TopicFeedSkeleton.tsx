import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import {
	DASHED_ROW_CLASS,
	RAIL_BARE_ICON_INSET,
	RAIL_TEXT_INSET,
	RANK_SLOT_CLASS,
	RESOURCE_LIST_CARD_CLASS,
} from "@/lib/styleClasses"

// the open section's topics, and the sections that start closed
const TOPIC_SKELETONS = ["t1", "t2"]
const CLOSED_SECTION_SKELETONS = ["s2", "s3", "s4"]

// five resource placeholders per topic
const RESOURCE_SKELETONS = ["r1", "r2", "r3", "r4", "r5"]

/**
 * A loading state for the topic sections. It mirrors the real layout so that content doesn't shift when the data arrives.
 */
export function TopicFeedSkeleton() {
	return (
		<div aria-hidden="true">
			{/* the section that opens first, then the closed ones */}
			<TopicSectionSkeleton isFirst>
				{TOPIC_SKELETONS.map((topic) => (
					<TopicSkeleton key={topic} />
				))}
			</TopicSectionSkeleton>
			{CLOSED_SECTION_SKELETONS.map((section) => (
				<TopicSectionSkeleton key={section} />
			))}
		</div>
	)
}

// one section skeleton mirroring the TopicSection
function TopicSectionSkeleton({ isFirst, children }: { isFirst?: boolean; children?: ReactNode }) {
	return (
		// the open first section has no divider under it, as an open section never does
		<div className={cn(!isFirst && "border-b last:border-b-0")}>
			{/* header: chevron, title, and the topic count on the right */}
			<div className={cn("flex items-center gap-2 pb-1", !isFirst && "pt-4")}>
				<div className="bg-muted size-4 shrink-0 animate-pulse rounded" />
				<div className="bg-muted my-0.5 h-6 w-32 animate-pulse rounded" />
				<div className={cn("bg-muted ml-auto h-4 w-16 animate-pulse rounded", RAIL_TEXT_INSET)} />
			</div>
			{children && <div className="pb-2">{children}</div>}
		</div>
	)
}

// one topic skeleton mirroring an untagged Topic. a header, then the resource rows in the same card they sit in
function TopicSkeleton() {
	return (
		<div className="py-1.5">
			{/* the title, then the play and note buttons */}
			<div className="flex items-center gap-2">
				<div className="bg-muted my-1 ml-4 h-[22.5px] w-52 animate-pulse rounded" />
				<div className="flex shrink-0 items-center">
					<div className="grid size-7 place-items-center">
						<div className="bg-muted size-6 animate-pulse rounded-full" />
					</div>
					<div className="grid size-7 place-items-center">
						<div className="bg-muted size-6 animate-pulse rounded-md" />
					</div>
				</div>
			</div>
			{/* the byline, then the "# new" count and the share button */}
			<div className="flex h-11 items-center justify-between gap-3 sm:h-[35px]">
				<div className="flex items-center gap-2 pl-4">
					<div className="bg-muted size-6 shrink-0 animate-pulse rounded-full" />
					<div className="bg-muted h-3 w-28 animate-pulse rounded" />
				</div>
				<div className={cn(RAIL_BARE_ICON_INSET, "flex shrink-0 items-center gap-1")}>
					<div className="bg-muted h-4 w-12 animate-pulse rounded" />
					<div className="grid w-7 place-items-center">
						<div className="bg-muted size-4 animate-pulse rounded" />
					</div>
				</div>
			</div>
			{/* the rows sit in the same card as the real list, so nothing shifts when the feed arrives */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "mt-1.5 p-1")}>
				{RESOURCE_SKELETONS.map((resourceKey) => (
					<ResourceSkeleton key={resourceKey} />
				))}
			</div>
			<ExpanderSkeleton className="pl-12" />
		</div>
	)
}

// one resource skeleton mirroring TopicResource: the rank slot, then the title line and the metadata line
export function ResourceSkeleton() {
	return (
		<div className={cn(DASHED_ROW_CLASS, "flex")}>
			{/* the rank slot the real row keeps for its number */}
			<div className={RANK_SLOT_CLASS}>
				<div className="bg-muted size-3 animate-pulse rounded" />
			</div>
			{/* the title, then the favicon, the source and age, and the chapter pill */}
			<div className="min-w-0 flex-1 py-3 pr-3 pl-9">
				<div className="flex h-5 items-center">
					<div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
				</div>
				<div className="mt-0.5 flex h-6 items-center gap-1.5">
					<div className="bg-muted size-[18px] shrink-0 animate-pulse rounded-full" />
					<div className="bg-muted h-3 w-2/5 animate-pulse rounded" />
					<ChapterPillSkeleton />
				</div>
			</div>
		</div>
	)
}

/**
 * The loading state of a chapter pill on a row's metadata line.
 */
export function ChapterPillSkeleton() {
	return <div className="bg-muted h-6 w-23 shrink-0 animate-pulse rounded-full" />
}

/**
 * The loading state of the line under a card where its "+ more" control sits, at the control's height and inset.
 */
export function ExpanderSkeleton({ className }: { className?: string }) {
	return (
		<div className={cn("mt-1 flex min-h-11 items-center pl-9 sm:min-h-9", className)}>
			<div className="bg-muted h-4 w-16 animate-pulse rounded" />
		</div>
	)
}
