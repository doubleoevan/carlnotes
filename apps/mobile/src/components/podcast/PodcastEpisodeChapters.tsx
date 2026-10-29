import {
	type ChapterTopicFeed,
	type PodcastEpisodeChapterRowProps,
	type PodcastEpisodeChaptersProps,
	PodcastEpisodeChapters as SharedPodcastEpisodeChapters,
	toPodcastEpisodeChapterSourceLabel,
} from "@carlnotes/core/components/PodcastEpisodeChapters"
import { usePodcastEpisodeChapterRating } from "@carlnotes/core/hooks/usePodcastEpisodeChapterRating"
import { playPodcastEpisode } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { MoreHorizontal } from "lucide-react-native"
import { type ComponentRef, type ReactNode, useRef, useState } from "react"
import { Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { RatingThumbs } from "@/components/common/RatingThumbs"
import { Sheet } from "@/components/common/Sheet"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicResourceInfo } from "@/components/topic/TopicResourceInfo"
import { useTopicResourceInfo } from "@/providers/TopicResourceInfoProvider"
import { PodcastEpisodeChapterPill } from "./PodcastEpisodePill"

export type { ChapterTopicFeed } from "@carlnotes/core/components/PodcastEpisodeChapters"

const ChapterList = ({ children }: { children: ReactNode }) => (
	<View className="-mx-4" accessibilityLabel="Chapters">
		{children}
	</View>
)

/**
 * Adapts the shared chapter list to platform Finding readers and chapter action sheets.
 */
export function PodcastEpisodeChapters(props: PodcastEpisodeChaptersProps<ChapterTopicFeed>) {
	return <SharedPodcastEpisodeChapters {...props} List={ChapterList} Row={PodcastEpisodeChapterRow} />
}

// keep chapter play controls independent from the Finding reader and orphan-chapter actions
function PodcastEpisodeChapterRow({
	podcastEpisode,
	chapter,
	isPlayerChapter,
	isHiddenUntilExpanded,
	isLastVisible,
	chapterTopicFeed: { topic, topicFeedHandlers, topicFindings, isRatable, isBookmarkable },
}: PodcastEpisodeChapterRowProps<ChapterTopicFeed>) {
	const info = useTopicResourceInfo()
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const [isActionsOpen, setIsActionsOpen] = useState(false)
	const [isLocalInfoOpen, setIsLocalInfoOpen] = useState(false)
	const { rating, isSaving, rate } = usePodcastEpisodeChapterRating(podcastEpisode.id, chapter)
	const finding = topicFindings.find((finding) => finding.findingId === chapter.findingId)
	const source = toPodcastEpisodeChapterSourceLabel(chapter)
	const canRateChapter = isRatable && chapter.findingId === null
	const handleOpenFinding = (): void => {
		if (finding && info) {
			info.open({
				resource: finding,
				topic: { ...topic, canRate: isRatable, canBookmark: isBookmarkable },
				latestPodcastEpisode: podcastEpisode,
				topicFeedHandlers,
				triggerRef,
			})
		} else if (finding) {
			setIsLocalInfoOpen(true)
		}
	}
	if (isHiddenUntilExpanded) {
		return null
	}
	return (
		<Pressable
			accessible={false}
			onPress={() => (finding ? handleOpenFinding() : void playPodcastEpisode(podcastEpisode, chapter.startSeconds))}
			className={cn(
				"relative flex-row items-center",
				!isLastVisible && "border-b border-dashed border-separator-strong",
				isPlayerChapter && "bg-accent",
			)}
		>
			{/* chapter number */}
			<Text
				className={cn(
					"w-9 text-center font-display text-sm text-muted-foreground",
					isPlayerChapter && "font-bold text-link",
				)}
			>
				{chapter.position + 1}
			</Text>
			<View className="min-w-0 flex-1 py-3 pr-3">
				{/* play from chapter title */}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Play chapter ${chapter.position + 1}: ${chapter.title}`}
					accessibilityState={{ selected: isPlayerChapter }}
					hitSlop={toTouchTargetHitSlop(20)}
					onPress={(event) => {
						event.stopPropagation()
						void playPodcastEpisode(podcastEpisode, chapter.startSeconds)
					}}
				>
					<Text numberOfLines={1} className={cn("text-sm font-bold", isPlayerChapter && "text-link")}>
						{chapter.title}
					</Text>
				</Pressable>
				{/* Finding and playback pill */}
				<View className="flex-row items-center gap-1.5">
					{finding ? (
						<Pressable
							ref={triggerRef}
							accessibilityRole="button"
							accessibilityLabel={`Open finding for chapter ${chapter.position + 1}: ${chapter.title}`}
							className="min-w-0 shrink"
							hitSlop={toTouchTargetHitSlop(20)}
							onPress={(event) => {
								event.stopPropagation()
								handleOpenFinding()
							}}
						>
							<Text numberOfLines={1} className="text-xs text-muted-foreground">
								{source}
							</Text>
						</Pressable>
					) : (
						<Text numberOfLines={1} className="min-w-0 shrink text-xs text-muted-foreground">
							{source}
						</Text>
					)}
					<PodcastEpisodeChapterPill podcastEpisode={podcastEpisode} chapter={chapter} />
				</View>
			</View>
			{/* chapter actions */}
			{canRateChapter && (
				<Button
					variant="ghost"
					size="icon"
					accessibilityLabel={`Chapter ${chapter.position + 1} actions`}
					onPress={(event) => {
						event.stopPropagation()
						setIsActionsOpen(true)
					}}
				>
					<Icon as={MoreHorizontal} />
				</Button>
			)}
			{isLocalInfoOpen && finding && (
				<TopicResourceInfo
					resource={finding}
					topic={{ ...topic, canRate: isRatable, canBookmark: isBookmarkable }}
					latestPodcastEpisode={podcastEpisode}
					topicFeedHandlers={topicFeedHandlers}
					triggerRef={triggerRef}
					onClose={() => setIsLocalInfoOpen(false)}
				/>
			)}
			{/* action sheets */}
			{isActionsOpen && (
				<Sheet title={`Chapter ${chapter.position + 1}`} onClose={() => setIsActionsOpen(false)}>
					<Text className="mb-3 text-base font-bold">{chapter.title}</Text>
					<AnchorLink href={chapter.sourceUrl} accessibilityLabel="Open chapter source" className="mb-3">
						<Text className="text-sm text-link">{source}</Text>
					</AnchorLink>
					<View className="flex-row gap-2">
						<RatingThumbs
							rating={rating}
							isDisabled={isSaving}
							onRate={(next) => void rate(next)}
							ariaLabelSuffix={`, chapter ${chapter.position + 1}`}
						/>
					</View>
				</Sheet>
			)}
		</Pressable>
	)
}
