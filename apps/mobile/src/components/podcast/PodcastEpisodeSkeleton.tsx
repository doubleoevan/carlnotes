// the podcast episode page's loading state: the button row, the image beside the title, the description, and the
// byline, then the podcast section with the player card, the film section, the comments, and the transcript
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { CollapsibleSectionSkeleton } from "@/components/topic/CollapsibleSectionSkeleton"
import {
	EmptySectionCardSkeleton,
	PodcastEpisodePlayerCardSkeleton,
	TopicPodcastEpisodeVideoCardSkeleton,
} from "@/components/topic/TopicSkeleton"
import { PAGE_BUTTON_ROW_CLASS } from "@/pageButtonClasses"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { HEADER_TOPIC_IMAGE_CLASS } from "@/topicImageClasses"

// the lines the loading state reserves for the title beside the image and for the transcript
const TITLE_LINE_KEYS = ["first", "second", "third"]
const TRANSCRIPT_LINE_KEYS = ["first", "second", "third", "fourth", "fifth", "sixth"]

/**
 * Reserves the podcast episode page in the loaded screen's own layout while its permission-aware payload loads.
 */
export function PodcastEpisodeSkeleton() {
	return (
		<View accessible accessibilityLabel="Loading episode" accessibilityState={{ busy: true }}>
			<SkeletonPulse>
				<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
					{/* the header's button row, with the header's own margin over it */}
					<View className={cn("-mt-1", PAGE_BUTTON_ROW_CLASS)}>
						<View className={cn(SKELETON_SHAPE_CLASS, "h-9 w-28 rounded-md")} />
						<View className={cn(SKELETON_SHAPE_CLASS, "h-9 w-28 rounded-md")} />
					</View>
					{/* the image beside the title's lines, the description, and the byline */}
					<View className="mt-4 flex-row items-start gap-4">
						<View className={cn(SKELETON_SHAPE_CLASS, "aspect-[3/2]", HEADER_TOPIC_IMAGE_CLASS)} />
						<View className="min-w-0 flex-1">
							{TITLE_LINE_KEYS.map((titleLineKey, i) => (
								<View key={titleLineKey} className="h-[30px] justify-center">
									<View
										className={cn(SKELETON_SHAPE_CLASS, "h-6", i === TITLE_LINE_KEYS.length - 1 ? "w-2/3" : "w-full")}
									/>
								</View>
							))}
							<View className="mt-1.5 h-5 justify-center">
								<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-full")} />
							</View>
							<View className="h-5 justify-center">
								<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-1/2")} />
							</View>
							<View className="mt-1.5 h-6 flex-row items-center gap-2">
								<View className={cn(SKELETON_SHAPE_CLASS, "size-6 rounded-full")} />
								<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-32")} />
							</View>
						</View>
					</View>
					{/* the sections, with the loaded screen's own gaps */}
					<View className="mt-5 gap-2">
						{/* the podcast section and its player card */}
						<CollapsibleSectionSkeleton>
							<PodcastEpisodePlayerCardSkeleton />
						</CollapsibleSectionSkeleton>
						{/* the film section and the film's card */}
						<CollapsibleSectionSkeleton>
							<TopicPodcastEpisodeVideoCardSkeleton />
						</CollapsibleSectionSkeleton>
						{/* the comments card */}
						<CollapsibleSectionSkeleton>
							<EmptySectionCardSkeleton />
						</CollapsibleSectionSkeleton>
						{/* the transcript's title and its first lines */}
						<View className="min-h-11 justify-center py-2">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-40")} />
						</View>
						<View className="gap-3 rounded-lg border border-separator bg-card p-5 shadow-raised">
							{TRANSCRIPT_LINE_KEYS.map((transcriptLineKey) => (
								<View key={transcriptLineKey} className={cn(SKELETON_SHAPE_CLASS, "h-4 w-full")} />
							))}
						</View>
					</View>
				</View>
			</SkeletonPulse>
		</View>
	)
}
