import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import type { ChapterTopicFeed } from "@carlnotes/core/components/PodcastEpisodeChapters"
import { toPodcastEpisodeChaptersTableColumns } from "@carlnotes/core/lib/podcastEpisodeChaptersTableColumns"
import { togglePodcastEpisodeChapterPlayback } from "@carlnotes/core/stores/podcastEpisodePlayActions"
import { usePlayerChapterPosition, usePodcastEpisodePlayer } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pause, Play } from "lucide-react-native"
import { type ComponentRef, useRef } from "react"
import { Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { DataTable } from "@/components/table/DataTable"
import { useTopicResourceInfo } from "@/providers/TopicResourceInfoProvider"

/**
 * Adapts the shared chapter columns to the existing table and Finding sheet at tablet width.
 */
export function PodcastEpisodeChaptersTable({
	podcastEpisode,
	chapterTopicFeed,
}: {
	podcastEpisode: PodcastEpisode
	chapterTopicFeed: ChapterTopicFeed
}) {
	const columns = toPodcastEpisodeChaptersTableColumns({
		chapters: podcastEpisode.chapters,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
		renderTitle: (chapter) => <ChapterTitle podcastEpisode={podcastEpisode} chapter={chapter} />,
		renderFinding: (chapter) => (
			<ChapterFinding podcastEpisode={podcastEpisode} chapter={chapter} feed={chapterTopicFeed} />
		),
	})
	return (
		<DataTable
			rows={podcastEpisode.chapters}
			columns={columns}
			getRowId={(chapter) => String(chapter.position)}
			valueByKey={{}}
		/>
	)
}

// keep chapter playback separate from opening its Finding
function ChapterTitle({ podcastEpisode, chapter }: { podcastEpisode: PodcastEpisode; chapter: PodcastEpisodeChapter }) {
	const isCurrent = usePlayerChapterPosition(podcastEpisode.id) === chapter.position
	const { isPlaying } = usePodcastEpisodePlayer()
	const isChapterPlaying = isCurrent && isPlaying
	return (
		<View className="flex-row items-center gap-3">
			<Button
				size="icon"
				variant={isCurrent ? "default" : "secondary"}
				className="rounded-full"
				accessibilityLabel={`${isChapterPlaying ? "Pause" : "Play"} chapter ${chapter.position + 1}`}
				onPress={() => void togglePodcastEpisodeChapterPlayback(podcastEpisode, chapter)}
			>
				<Icon
					as={isChapterPlaying ? Pause : Play}
					className={cn("size-4", !isCurrent && "text-link")}
					fill="currentColor"
				/>
			</Button>
			<Text className="min-w-0 flex-1 text-sm font-semibold">{chapter.title}</Text>
		</View>
	)
}

// use the same screen-level reader as the chapter list and feed
function ChapterFinding({
	podcastEpisode,
	chapter,
	feed,
}: {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
	feed: ChapterTopicFeed
}) {
	const info = useTopicResourceInfo()
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const finding = feed.topicFindings.find((item) => item.findingId === chapter.findingId)
	if (!finding) {
		return (
			<AnchorLink href={chapter.sourceUrl} accessibilityLabel={toHostWithoutWww(chapter.sourceUrl)}>
				<Text className="text-sm text-link">{toHostWithoutWww(chapter.sourceUrl)}</Text>
			</AnchorLink>
		)
	}
	return (
		<Pressable
			ref={triggerRef}
			accessibilityRole="button"
			accessibilityLabel={`Details for ${finding.title}`}
			onPress={() =>
				info?.open({
					resource: finding,
					topic: { ...feed.topic, canRate: feed.isRatable, canBookmark: feed.isBookmarkable },
					latestPodcastEpisode: podcastEpisode,
					topicFeedHandlers: feed.topicFeedHandlers,
					triggerRef,
				})
			}
		>
			<Text className="text-sm" numberOfLines={2}>
				{finding.title}
			</Text>
			<Text className="text-xs text-muted-foreground">{toHostWithoutWww(finding.url)}</Text>
		</Pressable>
	)
}
