import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { TopicFindingListCard } from "./TopicFindingList"

// the first section opens with five findings per Topic, as on Home
const TOPIC_KEYS = ["first", "second"]
const FINDING_KEYS = ["first", "second", "third", "fourth", "fifth"]
const CLOSED_SECTION_KEYS = ["subscribed", "featured", "popular"]

/**
 * Reserves Home's section headings, Topic headers, and shared finding cards.
 */
export function TopicFeedSkeleton() {
	return (
		<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			<SkeletonPulse>
				<SectionSkeleton />
				{TOPIC_KEYS.map((topicKey) => (
					<View key={topicKey}>
						{/* the linked title, byline, and unread count of an untagged Topic */}
						<View className="mx-4 py-1.5">
							<View className="flex-row items-center gap-2">
								<View className="my-1 ml-4 h-[22.5px] w-2/3 rounded bg-muted" />
								<View className="size-6 rounded-full bg-muted" />
								<View className="size-7 items-center justify-center">
									<View className="size-6 rounded bg-muted" />
								</View>
							</View>
							<View className="min-h-11 flex-row items-center gap-1">
								<View className="mr-auto flex-row items-center gap-2 pl-4">
									<View className="size-6 rounded-full bg-muted" />
									<View className="h-3 w-28 rounded bg-muted" />
								</View>
								<View className="h-4 w-12 rounded bg-muted" />
								<View className="w-7 items-center">
									<View className="size-4 rounded bg-muted" />
								</View>
							</View>
						</View>
						<FindingListSkeleton />
						<ExpanderSkeleton />
					</View>
				))}
				{CLOSED_SECTION_KEYS.map((sectionKey) => (
					<SectionSkeleton key={sectionKey} />
				))}
			</SkeletonPulse>
		</View>
	)
}

/**
 * Reserves the same rank, title, and metadata columns as the finding list.
 */
export function FindingListSkeleton({ hasChapterPills = true }: { hasChapterPills?: boolean }) {
	return (
		<TopicFindingListCard>
			{FINDING_KEYS.map((findingKey, i) => (
				<View
					key={findingKey}
					className={cn(
						"min-h-16 flex-row gap-2.5 py-3",
						i < FINDING_KEYS.length - 1 && "border-b border-dashed border-separator-strong",
					)}
				>
					{/* rank */}
					<View className="w-4 items-center pt-1.5">
						<View className="size-3 rounded bg-muted" />
					</View>
					{/* title, then the source line with a chapter pill if the Topic has a podcast episode */}
					<View className="flex-1 gap-0.5">
						<View className="h-5 justify-center">
							<View className="h-4 w-5/6 rounded bg-muted" />
						</View>
						<View className="flex-row items-center gap-1.5">
							<View className="size-4 rounded-full bg-muted" />
							<View className="h-3 w-2/5 rounded bg-muted" />
							{hasChapterPills && <View className="h-6 w-23 rounded-full bg-muted" />}
						</View>
					</View>
				</View>
			))}
		</TopicFindingListCard>
	)
}

/**
 * Reserves the text-sized expander at the list's usual inset.
 */
export function ExpanderSkeleton() {
	return (
		<View className="mt-1 mb-2 min-h-11 justify-center pl-12">
			<View className="h-4 w-16 rounded bg-muted" />
		</View>
	)
}

// keep the heading and topic-count slots aligned with Home's controls
function SectionSkeleton() {
	return (
		<View className="mx-4 min-h-11 flex-row items-center gap-2 pt-3 pb-1">
			<View className="size-4 rounded bg-muted" />
			<View className="h-6 w-32 rounded bg-muted" />
			<View className="ml-auto h-4 w-16 rounded bg-muted" />
		</View>
	)
}
