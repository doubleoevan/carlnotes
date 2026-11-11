import type { TopicDetails } from "@carlnotes/contracts/topics"
import {
	TopicSkeleton as SharedTopicSkeleton,
	type TopicSkeletonElements,
} from "@carlnotes/core/components/TopicSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"
import { Text, View } from "react-native"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { PAGE_BUTTON_ROW_CLASS } from "@/pageButtonClasses"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { HEADER_TOPIC_IMAGE_CLASS } from "@/topicImageClasses"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { CollapsibleSectionSkeleton } from "./CollapsibleSectionSkeleton"
import { ExpanderSkeleton, FindingListSkeleton } from "./TopicFeedSkeleton"

// use the known Topic header while its full page loads
export type TopicSkeletonProps = { topicPreview?: Pick<TopicDetails, "name" | "latestPodcastEpisode" | "tags"> }
const CHAPTER_KEYS = ["first", "second", "third"]
const INFO_KEYS = ["owner", "prompt", "notes"]

/**
 * Reserves the Topic screen in the loaded screen's own layout: the action bar, the header, the film, the podcast, the
 * findings, and the cards.
 */
export function TopicSkeleton({ topicPreview }: TopicSkeletonProps) {
	const hasPodcastEpisode = topicPreview === undefined || Boolean(topicPreview.latestPodcastEpisode?.pagePath)
	return (
		<SharedTopicSkeleton
			topicTitle={topicPreview?.name}
			hasPodcastEpisode={hasPodcastEpisode}
			hasTags={Boolean(topicPreview?.tags.length)}
			elements={TOPIC_SKELETON_ELEMENTS}
		/>
	)
}

// reserve the action bar's two buttons in the screen's own row, then the image with the title, the tags, the byline
// and the reactions, and the details line beside it
function TopicSkeletonHeader({ topicTitle, hasTags }: { topicTitle?: string; hasTags: boolean }) {
	return (
		<View>
			{/* the plain button at the left and the highlighted one at the right */}
			<View className={cn("mx-4 mt-2", PAGE_BUTTON_ROW_CLASS)}>
				<View className={cn(SKELETON_SHAPE_CLASS, "h-9 w-28 rounded-md")} />
				<View className={cn(SKELETON_SHAPE_CLASS, "h-9 w-28 rounded-md")} />
			</View>
			<View className="mx-4 my-4">
				<View className="flex-row items-start gap-4">
					<View className={cn(SKELETON_SHAPE_CLASS, "aspect-[3/2]", HEADER_TOPIC_IMAGE_CLASS)} />
					<View className="min-w-0 flex-1">
						{/* the title, or its placeholder on the title's own line */}
						{topicTitle ? (
							<Text style={toTypeRoleStyle("pageTitle")} className="shrink text-foreground">
								{topicTitle}
							</Text>
						) : (
							<View className="h-[30px] justify-center">
								<View className={cn(SKELETON_SHAPE_CLASS, "h-6 w-5/6")} />
							</View>
						)}
						{hasTags && <View className={cn(SKELETON_SHAPE_CLASS, "mt-1.5 h-5.5 w-28 rounded-full")} />}
						{/* the byline, and the reactions, which wrap under it beside the image */}
						<View className="mt-1.5 flex-row flex-wrap items-center gap-x-3">
							<View className="h-6 flex-row items-center gap-2">
								<View className={cn(SKELETON_SHAPE_CLASS, "size-6 rounded-full")} />
								<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-28")} />
							</View>
							<View className="h-8 justify-center">
								<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-36")} />
							</View>
						</View>
						{/* the details line of the screen's counts, at the line's own height */}
						<View className="mt-1 min-h-5 justify-center">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-3.5 w-full")} />
						</View>
					</View>
				</View>
			</View>
		</View>
	)
}

// the loaded screen's sections sit in one inset column, and each section is the collapsible section's own loading state
const TOPIC_SKELETON_ELEMENTS: TopicSkeletonElements = {
	Root: ({ children }) => (
		<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			{children}
		</View>
	),
	Header: TopicSkeletonHeader,
	Body: ({ children }) => (
		<SkeletonPulse>
			<View className="mx-4">{children}</View>
		</SkeletonPulse>
	),
	Section: ({ children }) => <CollapsibleSectionSkeleton>{children}</CollapsibleSectionSkeleton>,
	Cards: View,
	Column: View,
	Film: TopicPodcastEpisodeVideoCardSkeleton,
	Podcast: () => <PodcastEpisodePlayerCardSkeleton hasFeedButton />,
	// the findings' card has its own inset, so it leaves the column's, as the loaded list does
	Findings: ({ hasChapterPills }) => (
		<View className="-mx-4">
			<FindingListSkeleton hasChapterPills={hasChapterPills} />
		</View>
	),
	Comments: EmptySectionCardSkeleton,
	TopicPosts: EmptySectionCardSkeleton,
	InfoCard: InfoCardSkeleton,
	Episodes: PodcastEpisodesSkeleton,
	History: ScanHistorySkeleton,
	Expander: () => <ExpanderSkeleton className="pl-4.5" />,
}

/**
 * Reserves the card a section with no row yet shows, as the comment thread and the Topic Posts do: its button at the
 * left and its one line at the far right.
 */
export function EmptySectionCardSkeleton() {
	return (
		<View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-separator bg-card p-5 shadow-raised">
			<View className={cn(SKELETON_SHAPE_CLASS, "h-8 w-24 rounded-md")} />
			<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-40")} />
		</View>
	)
}

/**
 * Reserves a film's card: the frame, the seek bar, and the controls, which wrap onto two rows.
 */
export function TopicPodcastEpisodeVideoCardSkeleton() {
	return (
		<View className="gap-3 rounded-lg border border-separator bg-card p-5 shadow-raised">
			<View className={cn(SKELETON_SHAPE_CLASS, "aspect-video w-full rounded-lg")} />
			<View className={cn(SKELETON_SHAPE_CLASS, "h-1.5 rounded-full")} />
			<View className="h-[94px] flex-row items-start gap-3">
				<View className={cn(SKELETON_SHAPE_CLASS, "size-9 rounded-full")} />
				<View className={cn(SKELETON_SHAPE_CLASS, "size-9 rounded-full")} />
				<View className={cn(SKELETON_SHAPE_CLASS, "size-9 rounded-full")} />
			</View>
		</View>
	)
}

/**
 * Reserves the player card: the play button, the podcast episode's details, the seek bar, and the chapter rows. A card
 * with a podcast feed button holds it under the chapter rows.
 */
export function PodcastEpisodePlayerCardSkeleton({ hasFeedButton = false }: { hasFeedButton?: boolean }) {
	return (
		<View className="gap-4 rounded-lg border border-separator bg-card p-5 shadow-raised">
			{/* the round play button and the podcast episode's details, with a line's gap under them, where the card's
			    controls wrap */}
			<View className="flex-row items-center gap-4 pb-4">
				<View className={cn(SKELETON_SHAPE_CLASS, "size-14 rounded-full")} />
				<View className="flex-1 gap-0.5">
					{/* the season line, then the title and the details line on two lines each */}
					<View className="h-5 justify-center">
						<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-2/3")} />
					</View>
					<View>
						<View className="h-7 justify-center">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-6 w-full")} />
						</View>
						<View className="h-7 justify-center">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-6 w-2/3")} />
						</View>
					</View>
					<View>
						<View className="h-4 justify-center">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-3.5 w-5/6")} />
						</View>
						<View className="h-4 justify-center">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-3.5 w-1/2")} />
						</View>
					</View>
				</View>
			</View>
			{/* the seek bar */}
			<View className={cn(SKELETON_SHAPE_CLASS, "h-1.5 rounded-full")} />
			{/* the chapter rows. each row is a number, a title, a source, and a pill */}
			<View>
				{CHAPTER_KEYS.map((chapterKey, i) => (
					<View
						key={chapterKey}
						className={cn(
							"min-h-14 flex-row items-center gap-3 py-3",
							i < CHAPTER_KEYS.length - 1 && "border-b border-dashed border-separator-strong",
						)}
					>
						<View className={cn(SKELETON_SHAPE_CLASS, "size-3")} />
						<View className="flex-1 gap-2">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-5/6")} />
							<View className="flex-row items-center gap-1.5">
								<View className={cn(SKELETON_SHAPE_CLASS, "h-3 flex-1")} />
								<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-24 rounded-full")} />
							</View>
						</View>
					</View>
				))}
			</View>
			{/* the podcast feed button under the chapter rows */}
			{hasFeedButton && <View className={cn(SKELETON_SHAPE_CLASS, "h-11 rounded-lg")} />}
		</View>
	)
}

// preserve the Topic roast and settings label/value rows
function InfoCardSkeleton({ kind }: { kind: "info" | "settings" }) {
	const sectionKeys = kind === "info" ? INFO_KEYS : ["frequency", "findings", "sources", "podcast"]
	return (
		<View className="gap-3 rounded-lg border border-separator bg-card p-5 shadow-raised">
			{sectionKeys.map((sectionKey) => (
				<View key={sectionKey} className="gap-2">
					<View className="h-3.5 w-24 rounded bg-muted" />
					<View className="h-4 w-full rounded bg-muted" />
				</View>
			))}
		</View>
	)
}

// reserve two episode rows below the season tab, as on the web
function PodcastEpisodesSkeleton() {
	return (
		<View className="gap-3 rounded-lg border border-separator bg-card p-4 shadow-raised">
			<View className="h-4 w-10 rounded bg-muted" />
			{["first", "second"].map((episodeKey) => (
				<View key={episodeKey} className="min-h-11 flex-row items-center gap-3">
					<View className="size-11 rounded-full bg-muted" />
					<View className="flex-1 gap-2">
						<View className="h-4 w-2/3 rounded bg-muted" />
						<View className="h-3 w-1/3 rounded bg-muted" />
					</View>
				</View>
			))}
		</View>
	)
}

// reserve the diary's timestamp, scan totals, and notebook action
function ScanHistorySkeleton() {
	return (
		<View className="gap-3 rounded-lg border border-separator bg-card p-4 shadow-raised">
			{["first", "second"].map((scanKey) => (
				<View key={scanKey} className="min-h-11 flex-row items-center gap-3">
					<View className="h-4 w-24 rounded bg-muted" />
					<View className="h-3 flex-1 rounded bg-muted" />
					<View className="size-4 rounded bg-muted" />
				</View>
			))}
		</View>
	)
}
