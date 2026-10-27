import type { TopicDetails } from "@carlnotes/contracts/topics"
import {
	TopicSkeleton as SharedTopicSkeleton,
	type TopicSkeletonElements,
	type TopicSkeletonSection,
} from "@carlnotes/core/components/TopicSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { ExpanderSkeleton, FindingListSkeleton } from "./TopicFeedSkeleton"

// use the known Topic header while its full page loads
export type TopicSkeletonProps = { topicPreview?: Pick<TopicDetails, "name" | "latestPodcastEpisode"> }
const CHAPTER_KEYS = ["first", "second", "third"]
const INFO_KEYS = ["owner", "prompt", "notes"]

/**
 * Reserves the Topic screen's action bar, heading, podcast, findings, and metadata cards.
 */
export function TopicSkeleton({ topicPreview }: TopicSkeletonProps) {
	const hasPodcastEpisode = topicPreview === undefined || Boolean(topicPreview.latestPodcastEpisode?.pagePath)
	return (
		<SharedTopicSkeleton
			topicTitle={topicPreview?.name}
			hasPodcastEpisode={hasPodcastEpisode}
			elements={TOPIC_SKELETON_ELEMENTS}
		/>
	)
}

// reserve the existing action bar, title, byline, and tags
function TopicSkeletonHeader({ topicTitle }: { topicTitle?: string }) {
	return (
		<View>
			{/* the action bar, title, byline, and tags */}
			<View className="mx-4 mt-1 mb-3 flex-row justify-between">
				<View className="h-11 w-24 rounded-lg bg-muted" />
				<View className="h-11 w-24 rounded-lg bg-muted" />
			</View>
			<View className="mx-4 mb-3">
				{topicTitle ? (
					<Text style={toTypeRoleStyle("pageTitle")} className="text-foreground">
						{topicTitle}
					</Text>
				) : (
					<View className="min-h-11 justify-center">
						<View className="h-8 w-5/6 rounded bg-muted" />
					</View>
				)}
				<View className="min-h-11 flex-row items-center gap-2">
					<View className="size-6 rounded-full bg-muted" />
					<View className="h-4 w-40 rounded bg-muted" />
				</View>
				<View className="mt-2 h-5 w-20 rounded-full bg-muted" />
			</View>
		</View>
	)
}

const TOPIC_SKELETON_ELEMENTS: TopicSkeletonElements = {
	Root: ({ children }) => (
		<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			{children}
		</View>
	),
	Header: TopicSkeletonHeader,
	Body: SkeletonPulse,
	Section: SectionSkeleton,
	Cards: View,
	Column: View,
	Podcast: PodcastSkeleton,
	Findings: FindingListSkeleton,
	InfoCard: InfoCardSkeleton,
	Episodes: PodcastEpisodesSkeleton,
	History: ScanHistorySkeleton,
	Expander: ExpanderSkeleton,
}

// keep the heading's touch-height spacing around decorative placeholders
function SectionSkeleton({ children }: { kind: TopicSkeletonSection; children: ReactNode }) {
	return (
		<View className="mb-3">
			<View className="mx-4 min-h-12 flex-row items-center gap-2 py-2">
				<View className="size-4 rounded bg-muted" />
				<View className="h-7 w-36 rounded bg-muted" />
			</View>
			{children}
		</View>
	)
}

// match the native episode card's play control, details, chapters, and subscription button
function PodcastSkeleton() {
	return (
		<View className="mx-4 gap-4 rounded-lg border border-separator bg-card p-5 shadow-raised">
			<View className="flex-row items-center gap-4">
				<View className="size-14 rounded-full bg-muted" />
				<View className="flex-1 gap-2">
					<View className="h-4 w-2/3 rounded bg-muted" />
					<View className="h-6 w-full rounded bg-muted" />
					<View className="h-3 w-5/6 rounded bg-muted" />
				</View>
			</View>
			<View>
				{CHAPTER_KEYS.map((chapterKey, i) => (
					<View
						key={chapterKey}
						className={cn(
							"min-h-14 flex-row items-center gap-3 py-3",
							i < CHAPTER_KEYS.length - 1 && "border-b border-dashed border-separator-strong",
						)}
					>
						<View className="size-3 rounded bg-muted" />
						<View className="flex-1 gap-2">
							<View className="h-4 w-5/6 rounded bg-muted" />
							<View className="flex-row items-center gap-1.5">
								<View className="h-3 flex-1 rounded bg-muted" />
								<View className="h-5 w-24 rounded-full bg-muted" />
							</View>
						</View>
					</View>
				))}
			</View>
			<View className="h-11 rounded-lg bg-muted" />
		</View>
	)
}

// preserve the Topic roast and settings label/value rows
function InfoCardSkeleton({ kind }: { kind: "info" | "settings" }) {
	const sectionKeys = kind === "info" ? INFO_KEYS : ["frequency", "findings", "sources", "podcast"]
	return (
		<View className="mx-4 gap-3 rounded-lg border border-separator bg-card p-5 shadow-raised">
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
		<View className="mx-4 gap-3 rounded-lg border border-separator bg-card p-4 shadow-raised">
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
		<View className="mx-4 gap-3 rounded-lg border border-separator bg-card p-4 shadow-raised">
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
