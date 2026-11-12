import {
	TopicSkeleton as SharedTopicSkeleton,
	type TopicSkeletonElements,
	type TopicSkeletonSection,
} from "@carlnotes/core/components/TopicSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import {
	HEADER_TOPIC_IMAGE_CLASS,
	PLAIN_TOPIC_HEADER_GRID_CLASS,
	TOPIC_HEADER_AREA_CLASSES,
} from "@/lib/pageHeaderClasses"
import {
	DASHED_ROW_CLASS,
	FILM_CARD_CLASS,
	IMAGE_SKELETON_CLASS,
	INFO_CARD_CLASS,
	INFO_CARD_SECTIONS_CLASS,
	RANK_SLOT_CLASS,
	RESOURCE_LIST_CARD_CLASS,
	ROW_AVATAR_SKELETON_CLASS,
} from "@/lib/styleClasses"
import { MORE_UNDER_CARD_CLASS } from "./MoreButton"
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
 * The loading state for the topic below the page's button row, in the loaded page's own layout: the header, the film,
 * the player, the findings, and the cards.
 */
export function TopicSkeleton({ topicTitle }: { topicTitle?: string }) {
	return <SharedTopicSkeleton topicTitle={topicTitle} elements={TOPIC_SKELETON_ELEMENTS} />
}

// the Topic's header in the loaded header's grid, which floats the image on a phone: the image, the title, and the
// byline with the reactions after it over the details line
function TopicSkeletonHeader({ topicTitle }: { topicTitle?: string }) {
	return (
		<div className={PLAIN_TOPIC_HEADER_GRID_CLASS}>
			<div
				aria-hidden="true"
				className={cn(TOPIC_HEADER_AREA_CLASSES.image, HEADER_TOPIC_IMAGE_CLASS, IMAGE_SKELETON_CLASS)}
			/>
			{/* the title, or its placeholder on the title's own line */}
			{topicTitle ? (
				<h1 className={cn(TOPIC_HEADER_AREA_CLASSES.title, "font-display text-2xl leading-tight")}>{topicTitle}</h1>
			) : (
				<div aria-hidden="true" className={cn(TOPIC_HEADER_AREA_CLASSES.title, "flex h-7.5 items-center")}>
					<div className="bg-muted h-6 w-96 max-w-full animate-pulse rounded" />
				</div>
			)}
			{/* the byline and the reactions, under the image on a phone, then the details line of the page's counts */}
			<div aria-hidden="true" className="mt-1.5 max-sm:clear-left sm:contents">
				<div className={TOPIC_HEADER_AREA_CLASSES.byline}>
					<div className="flex h-8 items-center gap-x-3">
						<div className="flex items-center gap-2">
							<div className={ROW_AVATAR_SKELETON_CLASS} />
							<div className="bg-muted h-4 w-32 animate-pulse rounded" />
						</div>
						<div className="bg-muted h-5 w-36 animate-pulse rounded" />
					</div>
					<div className="mt-1 flex h-5 items-center">
						<div className="bg-muted h-3.5 w-72 max-w-full animate-pulse rounded" />
					</div>
				</div>
			</div>
		</div>
	)
}

// each section's title width
const SECTION_TITLE_CLASSES: Record<TopicSkeletonSection, string> = {
	film: "w-52",
	podcast: "w-54",
	findings: "w-32",
	comments: "w-30",
	topicPosts: "w-22",
	info: "w-28",
	settings: "w-34",
	films: "w-48",
	episodes: "w-76",
	history: "w-26",
}

// the film's and the podcast's sections, which the page spaces from what is above them, and which show the theme
// song's note after their titles
const PLAYER_SECTION_KINDS: ReadonlySet<TopicSkeletonSection> = new Set(["film", "podcast"])

// the sections whose titles end in a count at the far right
const COUNTED_SECTION_KINDS: ReadonlySet<TopicSkeletonSection> = new Set(["findings", "films", "episodes", "history"])

// one section in the loaded section's title row and spacing
function TopicSectionSkeleton({ kind, children }: { kind: TopicSkeletonSection; children: React.ReactNode }) {
	const isPlayerSection = PLAYER_SECTION_KINDS.has(kind)
	return (
		<CollapsibleSectionSkeleton
			titleClassName={SECTION_TITLE_CLASSES[kind]}
			className={isPlayerSection ? "mt-2" : undefined}
			titleNote={isPlayerSection && <PodcastThemeSongNoteSkeleton />}
			hasCount={COUNTED_SECTION_KINDS.has(kind)}
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

// the web's elements: the loaded header's grid, each section's title row, the cards, and the desktop grid
const TOPIC_SKELETON_ELEMENTS: TopicSkeletonElements = {
	Root: ({ children }) => <div>{children}</div>,
	Header: TopicSkeletonHeader,
	Body: ({ children }) => <div aria-hidden="true">{children}</div>,
	Section: TopicSectionSkeleton,
	Cards: ({ children }) => <div className="grid gap-x-8 lg:grid-cols-[32rem_minmax(0,1fr)]">{children}</div>,
	Column: ({ children }) => <div className="min-w-0">{children}</div>,
	Film: TopicPodcastEpisodeVideoCardSkeleton,
	Podcast: () => <PodcastEpisodePlayerCardSkeleton hasFeedButton />,
	Findings: FindingListSkeleton,
	Comments: EmptySectionCardSkeleton,
	TopicPosts: EmptySectionCardSkeleton,
	InfoCard: ({ kind }) => <InfoCardSkeleton sectionKeys={kind === "info" ? INFO_SKELETONS : SETTINGS_SKELETONS} />,
	Episodes: PodcastEpisodesCardSkeleton,
	History: ScanHistorySkeleton,
	Expander: () => <ExpanderSkeleton className={MORE_UNDER_CARD_CLASS} />,
}

// the title bar's width, what sits right after the title, whether a count ends the title row, and the section's content
type CollapsibleSectionSkeletonProps = {
	titleClassName: string
	className?: string
	titleNote?: React.ReactNode
	hasCount?: boolean
	children: React.ReactNode
}

/**
 * The loading state of a collapsible section. A chevron and a title bar at the accordion trigger's padding, with the
 * count at the far right, then the section's content.
 */
export function CollapsibleSectionSkeleton({
	titleClassName,
	className,
	titleNote,
	hasCount = false,
	children,
}: CollapsibleSectionSkeletonProps) {
	return (
		<div className={cn("pb-2", className)}>
			{/* the chevron, the title bar, what sits after it, and the count */}
			<div className="flex items-center gap-2 py-2">
				<div className="bg-muted size-4 shrink-0 animate-pulse rounded" />
				<div className={cn("bg-muted h-7 max-w-full animate-pulse rounded", titleClassName)} />
				{titleNote}
				{hasCount && <div className="bg-muted ml-auto h-4 w-16 shrink-0 animate-pulse rounded" />}
			</div>
			{children}
		</div>
	)
}

/**
 * The loading state of the theme song's note after a film section's or a podcast section's title.
 */
export function PodcastThemeSongNoteSkeleton() {
	return <div className="bg-muted size-7 shrink-0 animate-pulse rounded" />
}

/**
 * The loading state of the card a section with no row yet shows, as the comment thread and the Topic Posts do: its
 * button at the left and its one line at the far right.
 */
export function EmptySectionCardSkeleton() {
	return (
		<div className={cn(INFO_CARD_CLASS, "flex flex-wrap items-center justify-between gap-x-4 gap-y-3")}>
			<div className="bg-muted h-8 w-24 animate-pulse rounded-md" />
			<div className="bg-muted h-4 w-40 animate-pulse rounded" />
		</div>
	)
}

/**
 * The loading state of a film's card: the frame, the seek bar, and the controls, which wrap onto two rows on a phone.
 */
export function TopicPodcastEpisodeVideoCardSkeleton() {
	return (
		<div className={FILM_CARD_CLASS}>
			<div className="bg-muted aspect-video w-full animate-pulse rounded-lg" />
			{/* the seek bar, at the height of its time labels on a wide screen */}
			<div className="flex h-1.5 items-center sm:h-4">
				<div className="bg-muted h-1.5 flex-1 animate-pulse rounded-full" />
			</div>
			<div className="flex h-[94px] items-start gap-3 sm:h-9 sm:items-center">
				<div className="bg-muted size-9 animate-pulse rounded-full" />
				<div className="bg-muted size-9 animate-pulse rounded-full" />
				<div className="bg-muted size-9 animate-pulse rounded-full" />
			</div>
		</div>
	)
}

/**
 * The loading state of the player card, with the play button, the podcast episode's details, the seek bar, and the
 * chapter rows. A card with a podcast feed button holds it beside the details on a wide screen, and under the chapter
 * rows on a phone.
 */
export function PodcastEpisodePlayerCardSkeleton({ hasFeedButton = false }: { hasFeedButton?: boolean }) {
	return (
		<div className={cn(INFO_CARD_CLASS, "flex flex-col gap-4")}>
			{/* the round play button and the podcast episode's details. a phone keeps a line's gap under them, where the
			    card's controls wrap */}
			<div className="flex items-center gap-4 pb-4 sm:pb-0">
				<div className="bg-muted size-14 shrink-0 animate-pulse rounded-full sm:size-16" />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:max-w-87">
					{/* the season line */}
					<div className="flex h-5 items-center">
						<div className="bg-muted h-4 w-36 animate-pulse rounded" />
					</div>
					{/* the title, on two lines on a phone */}
					<div>
						<div className="flex h-7 items-center">
							<div className="bg-muted h-6 w-72 max-w-full animate-pulse rounded" />
						</div>
						<div className="flex h-7 items-center sm:hidden">
							<div className="bg-muted h-6 w-2/3 animate-pulse rounded" />
						</div>
					</div>
					{/* the details line, on two lines on a phone */}
					<div>
						<div className="flex h-4 items-center">
							<div className="bg-muted h-3.5 w-56 max-w-full animate-pulse rounded" />
						</div>
						<div className="flex h-4 items-center sm:hidden">
							<div className="bg-muted h-3.5 w-1/2 animate-pulse rounded" />
						</div>
					</div>
				</div>
				{hasFeedButton && <div className="bg-muted hidden h-9 w-28 shrink-0 animate-pulse rounded-lg sm:block" />}
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
			{/* the podcast feed button under the chapter rows on a phone */}
			{hasFeedButton && <div className="bg-muted h-11 animate-pulse rounded-lg sm:hidden" />}
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
