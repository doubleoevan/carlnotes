import {
	TopicSkeleton as SharedTopicSkeleton,
	type TopicSkeletonElements,
	type TopicSkeletonSection,
} from "@carlnotes/core/components/TopicSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import {
	DASHED_ROW_CLASS,
	HEADER_TOPIC_IMAGE_CLASS,
	IMAGE_HEADER_CLASS,
	IMAGE_SKELETON_CLASS,
	INFO_CARD_CLASS,
	INFO_CARD_SECTIONS_CLASS,
	RANK_SLOT_CLASS,
	RESOURCE_LIST_CARD_CLASS,
} from "@/lib/styleClasses"
import { ChapterPillSkeleton, ExpanderSkeleton, ResourceSkeleton } from "./TopicFeedSkeleton"

// placeholder keys for the skeleton's chapter rows, finding rows, podcast episode rows, and history rows
const CHAPTER_SKELETONS = ["c1", "c2", "c3"]
const FINDING_SKELETONS = ["f1", "f2", "f3", "f4", "f5"]
const PODCAST_EPISODE_SKELETONS = ["e1", "e2"]
const SCAN_SKELETONS = ["s1", "s2"]

// placeholder keys for the sections of the info card and of the settings card
const INFO_SKELETONS = ["owner", "prompt", "notes"]
const SETTINGS_SKELETONS = ["frequency", "findings", "sources", "podcast"]

/**
 * The loading state for the topic below the static button row, with the header, player, findings, and cards.
 */
export function TopicSkeleton({ topicTitle }: { topicTitle?: string }) {
	return <SharedTopicSkeleton topicTitle={topicTitle} elements={TOPIC_SKELETON_ELEMENTS} />
}

// the Topic's image placeholder, with its title and byline beside it, above the shared sections
function TopicSkeletonHeader({ topicTitle }: { topicTitle?: string }) {
	return (
		<div className={IMAGE_HEADER_CLASS}>
			<div aria-hidden="true" className={cn(HEADER_TOPIC_IMAGE_CLASS, IMAGE_SKELETON_CLASS, "rounded-lg")} />
			<div className="min-w-0 flex-1">
				{topicTitle ? (
					<h1 className="font-display min-w-0 text-2xl leading-tight">{topicTitle}</h1>
				) : (
					<div aria-hidden="true" className="bg-muted h-7.5 w-96 max-w-full animate-pulse rounded" />
				)}
				<div aria-hidden="true" className="mt-2 flex h-[31px] items-center gap-2">
					<div className="bg-muted size-6 shrink-0 animate-pulse rounded-full" />
					<div className="bg-muted h-4 w-40 animate-pulse rounded" />
				</div>
			</div>
		</div>
	)
}

// the section widths, with the podcast and findings sections spaced as the page spaces them
function TopicSectionSkeleton({ kind, children }: { kind: TopicSkeletonSection; children: React.ReactNode }) {
	const titleWidths = {
		podcast: "w-36",
		findings: "w-28",
		info: "w-24",
		settings: "w-32",
		episodes: "w-52",
		history: "w-20",
	}
	return (
		<CollapsibleSectionSkeleton
			titleClassName={titleWidths[kind]}
			className={kind === "podcast" || kind === "findings" ? "mt-2" : undefined}
			titleAside={kind === "findings" && <div className="bg-muted h-4 w-12 animate-pulse rounded" />}
		>
			{children}
		</CollapsibleSectionSkeleton>
	)
}

// use the same finding rows as Home while keeping the Topic card's inset
function FindingListSkeleton() {
	return (
		<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
			{FINDING_SKELETONS.map((skeletonKey) => (
				<ResourceSkeleton key={skeletonKey} />
			))}
		</div>
	)
}

const TOPIC_SKELETON_ELEMENTS: TopicSkeletonElements = {
	Root: ({ children }) => <div>{children}</div>,
	Header: TopicSkeletonHeader,
	Body: ({ children }) => <div aria-hidden="true">{children}</div>,
	Section: TopicSectionSkeleton,
	Cards: ({ children }) => <div className="grid gap-x-8 lg:grid-cols-[32rem_minmax(0,1fr)]">{children}</div>,
	Column: ({ children }) => <div className="min-w-0">{children}</div>,
	Podcast: PodcastEpisodePlayerCardSkeleton,
	Findings: FindingListSkeleton,
	InfoCard: ({ kind }) => <InfoCardSkeleton sectionKeys={kind === "info" ? INFO_SKELETONS : SETTINGS_SKELETONS} />,
	Episodes: PodcastEpisodesCardSkeleton,
	History: ScanHistorySkeleton,
	Expander: ExpanderSkeleton,
}

// the title bar's width, what sits after the title, and the section's content
type CollapsibleSectionSkeletonProps = {
	titleClassName: string
	className?: string
	titleAside?: React.ReactNode
	children: React.ReactNode
}

/**
 * The loading state of a collapsible section. A chevron and a title bar at the accordion trigger's padding,
 * then the section's content.
 */
export function CollapsibleSectionSkeleton({
	titleClassName,
	className,
	titleAside,
	children,
}: CollapsibleSectionSkeletonProps) {
	return (
		<div className={cn("pb-2", className)}>
			{/* the chevron and the title bar */}
			<div className="flex items-center gap-2 py-2">
				<div className="bg-muted size-4 animate-pulse rounded" />
				<div className={cn("bg-muted h-7 animate-pulse rounded", titleClassName)} />
				{titleAside}
			</div>
			{children}
		</div>
	)
}

/**
 * The loading state of the player card, with the play button, the podcast episode's details, the seek bar,
 * the chapter rows, and on a phone the podcast feed button under them.
 */
export function PodcastEpisodePlayerCardSkeleton() {
	return (
		<div className={cn(INFO_CARD_CLASS, "flex flex-col gap-4")}>
			{/* the round play button, the season, title, and details lines, and the podcast feed button on a wide screen.
			    a phone keeps a line's gap under them, where the wide screen's button wraps */}
			<div className="flex items-center gap-4 pb-4 sm:pb-0">
				<div className="bg-muted size-14 shrink-0 animate-pulse rounded-full sm:size-16" />
				<div className="flex min-w-0 flex-1 flex-col gap-[7px] sm:max-w-87">
					<div className="bg-muted h-4 w-36 animate-pulse rounded" />
					<div className="bg-muted h-6 w-72 max-w-full animate-pulse rounded" />
					<div className="bg-muted h-3.5 w-56 max-w-full animate-pulse rounded" />
				</div>
				<div className="bg-muted hidden h-9 w-28 shrink-0 animate-pulse rounded-lg sm:block" />
			</div>
			{/* the seek bar, at the height of its time labels on a wide screen */}
			<div className="flex h-1.5 items-center sm:h-4">
				<div className="bg-muted h-1.5 flex-1 animate-pulse rounded-full" />
			</div>
			{/* the chapter rows, which run close to the card's edges. each row is a number, a title, a source, and a pill */}
			<div className="-mx-4 sm:-mb-4">
				{CHAPTER_SKELETONS.map((skeletonKey) => (
					<div key={skeletonKey} className={cn(DASHED_ROW_CLASS, "py-3 pr-3 pl-9")}>
						<div className={RANK_SLOT_CLASS}>
							<div className="bg-muted size-3 animate-pulse rounded" />
						</div>
						<div className="flex h-5 items-center">
							<div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
						</div>
						<div className="flex h-6 items-center gap-1.5">
							<div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
							<ChapterPillSkeleton />
						</div>
					</div>
				))}
			</div>
			<div className="bg-muted h-11 animate-pulse rounded-lg sm:hidden" />
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
		<div className={cn(INFO_CARD_CLASS, INFO_CARD_SECTIONS_CLASS)}>
			{sectionKeys.map((sectionKey) => (
				<div key={sectionKey} className="py-3 first:pt-0 last:pb-0">
					<div className="bg-muted h-3.5 w-24 animate-pulse rounded" />
					<div className="bg-muted mt-2 h-4 w-full animate-pulse rounded" />
				</div>
			))}
		</div>
	)
}
