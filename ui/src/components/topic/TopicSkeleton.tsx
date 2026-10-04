import type * as React from "react"
import { ResourceSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { DASHED_ROW_CLASS, INFO_CARD_CLASS, RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// placeholder keys for the skeleton's chapter rows, finding rows, podcast episode rows, and history rows
const CHAPTER_SKELETONS = ["c1", "c2", "c3"]
const FINDING_SKELETONS = ["f1", "f2", "f3", "f4", "f5"]
const PODCAST_EPISODE_SKELETONS = ["e1", "e2"]
const SCAN_SKELETONS = ["s1", "s2"]

// placeholder keys for the sections of the info card and of the settings card
const INFO_SKELETONS = ["owner", "prompt", "notes"]
const SETTINGS_SKELETONS = ["frequency", "findings", "sources", "podcast"]

// the slot that a chapter row's number sits in
const CHAPTER_NUMBER_SLOT_CLASS = "absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"

/**
 * The loading state for the topic below the static button row, with the header, player, findings, and cards.
 */
export function TopicSkeleton({ topicTitle }: { topicTitle?: string }) {
	return (
		<div>
			{/* title row with the unread count, where the real title sits */}
			<div className="mt-6 flex items-start justify-between gap-3">
				{topicTitle ? (
					<h1 className="font-display min-w-0 text-2xl leading-tight">{topicTitle}</h1>
				) : (
					<div aria-hidden="true" className="bg-muted h-8 w-96 max-w-full animate-pulse rounded" />
				)}
				<div aria-hidden="true" className="bg-muted h-5 w-14 shrink-0 animate-pulse rounded" />
			</div>

			{/* everything below the title is decorative pulse, hidden from assistive tech as one block */}
			<div aria-hidden="true">
				{/* the owner byline placeholder where "Brewed by" sits, with the avatar circle and then the byline bar */}
				<div className="mt-2 flex items-center gap-2">
					<div className="bg-muted size-6 shrink-0 animate-pulse rounded-full" />
					<div className="bg-muted h-4 w-40 animate-pulse rounded" />
				</div>

				{/* the podcast episode player section, with the expander line under its card */}
				<CollapsibleSectionSkeleton className="mt-3" titleClassName="w-36">
					<PodcastEpisodePlayerCardSkeleton />
					<ExpanderSkeleton />
				</CollapsibleSectionSkeleton>

				{/* the findings section, with the expander line under its rows */}
				<CollapsibleSectionSkeleton titleClassName="w-28">
					<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
						{FINDING_SKELETONS.map((skeletonKey) => (
							<ResourceSkeleton key={skeletonKey} />
						))}
					</div>
					<ExpanderSkeleton />
				</CollapsibleSectionSkeleton>

				{/* the info and settings cards on the left, and the podcast episodes and history cards on the right */}
				<div className="grid gap-x-8 lg:grid-cols-[32rem_minmax(0,1fr)]">
					<div className="min-w-0">
						<CollapsibleSectionSkeleton titleClassName="w-24">
							<InfoCardSkeleton sectionKeys={INFO_SKELETONS} />
						</CollapsibleSectionSkeleton>
						<CollapsibleSectionSkeleton titleClassName="w-32">
							<InfoCardSkeleton sectionKeys={SETTINGS_SKELETONS} />
						</CollapsibleSectionSkeleton>
					</div>
					<div className="min-w-0">
						<CollapsibleSectionSkeleton titleClassName="w-52">
							<PodcastEpisodesCardSkeleton />
						</CollapsibleSectionSkeleton>
						<CollapsibleSectionSkeleton titleClassName="w-20">
							<ScanHistorySkeleton />
						</CollapsibleSectionSkeleton>
					</div>
				</div>
			</div>
		</div>
	)
}

// the title bar's width, and the section's content
type CollapsibleSectionSkeletonProps = { titleClassName: string; className?: string; children: React.ReactNode }

/**
 * The loading state of a collapsible section. A chevron and a title bar at the accordion trigger's padding,
 * then the section's content.
 */
export function CollapsibleSectionSkeleton({ titleClassName, className, children }: CollapsibleSectionSkeletonProps) {
	return (
		<div className={cn("pb-2", className)}>
			{/* the chevron and the title bar */}
			<div className="flex items-center gap-2 py-2">
				<div className="bg-muted size-4 animate-pulse rounded" />
				<div className={cn("bg-muted h-7 animate-pulse rounded", titleClassName)} />
			</div>
			{children}
		</div>
	)
}

/**
 * The loading state of the line under a card where its "+ more" control sits.
 */
export function ExpanderSkeleton() {
	return (
		<div className="mt-1 flex min-h-9 items-center">
			<div className="bg-muted h-4 w-16 animate-pulse rounded" />
		</div>
	)
}

/**
 * The loading state of the player card, with the play button, the podcast episode's details, the seek bar,
 * and the chapter rows.
 */
export function PodcastEpisodePlayerCardSkeleton() {
	return (
		<div className={cn(INFO_CARD_CLASS, "flex flex-col gap-4")}>
			{/* the round play button, the season, title, and details lines, and the podcast feed button on a wide screen */}
			<div className="flex items-center gap-4">
				<div className="bg-muted size-14 shrink-0 animate-pulse rounded-full sm:size-16" />
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="bg-muted h-4 w-36 animate-pulse rounded" />
					<div className="bg-muted h-6 w-72 max-w-full animate-pulse rounded" />
					<div className="bg-muted h-3.5 w-56 max-w-full animate-pulse rounded" />
				</div>
				<div className="bg-muted hidden h-9 w-28 shrink-0 animate-pulse rounded-lg sm:block" />
			</div>
			{/* the seek bar at the height of its time labels */}
			<div className="flex h-4 items-center">
				<div className="bg-muted h-1.5 flex-1 animate-pulse rounded-full" />
			</div>
			{/* the chapter rows, which run close to the card's edges. each row is a number, a title, and a source line */}
			<div className="-mx-4 sm:-mb-4">
				{CHAPTER_SKELETONS.map((skeletonKey) => (
					<div key={skeletonKey} className={cn(DASHED_ROW_CLASS, "py-3 pr-3 pl-9")}>
						<div className={CHAPTER_NUMBER_SLOT_CLASS}>
							<div className="bg-muted size-3 animate-pulse rounded" />
						</div>
						<div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
						<div className="bg-muted mt-2 h-3 w-1/3 animate-pulse rounded" />
					</div>
				))}
			</div>
		</div>
	)
}

// the loading state of the podcast episodes card.
// the season tab, then rows of a play button, a title, and a details line
function PodcastEpisodesCardSkeleton() {
	return (
		<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
			{/* the season tab */}
			<div className="flex min-h-11 items-center px-5.5 sm:min-h-9">
				<div className="bg-muted h-4 w-10 animate-pulse rounded" />
			</div>
			{/* the podcast episode rows */}
			{PODCAST_EPISODE_SKELETONS.map((skeletonKey) => (
				<div key={skeletonKey} className={cn(DASHED_ROW_CLASS, "flex items-center gap-3 py-2.5 pr-1 pl-2")}>
					<div className="bg-muted size-11 shrink-0 animate-pulse rounded-full sm:size-9" />
					<div className="min-w-0 flex-1">
						<div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
						<div className="bg-muted mt-2 h-3 w-1/3 animate-pulse rounded" />
					</div>
				</div>
			))}
		</div>
	)
}

// the loading state of the scan history card. each row is a timestamp, a stat, and the note that the row opens
function ScanHistorySkeleton() {
	return (
		<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
			{SCAN_SKELETONS.map((skeletonKey) => (
				<div key={skeletonKey} className={cn(DASHED_ROW_CLASS, "flex items-center gap-3 py-2.5 pr-1 pl-2")}>
					<div className="bg-muted h-4 w-28 shrink-0 animate-pulse rounded" />
					<div className="bg-muted h-3 w-24 flex-1 animate-pulse rounded" />
					<div className="grid size-11 shrink-0 place-items-center sm:size-7">
						<div className="bg-muted size-4 animate-pulse rounded" />
					</div>
				</div>
			))}
		</div>
	)
}

// an info card with a label bar and a text bar per section, split by dashed dividers
function InfoCardSkeleton({ sectionKeys }: { sectionKeys: string[] }) {
	return (
		<div className={cn(INFO_CARD_CLASS, "divide-separator-strong divide-y divide-dashed")}>
			{sectionKeys.map((sectionKey) => (
				<div key={sectionKey} className="py-3 first:pt-0 last:pb-0">
					<div className="bg-muted h-3.5 w-24 animate-pulse rounded" />
					<div className="bg-muted mt-2 h-4 w-full animate-pulse rounded" />
				</div>
			))}
		</div>
	)
}
