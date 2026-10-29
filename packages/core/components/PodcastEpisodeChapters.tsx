import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentType, ReactNode } from "react"
import type { TopicFeedHandlers } from "../hooks/useTopicFindingActions"
import { toClockLabel } from "../lib/labels"

export const SHOWN_CHAPTER_COUNT = 3
export type PodcastEpisodeChapterRowProps<T> = {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
	isPlayerChapter: boolean
	isHiddenUntilExpanded: boolean
	isLastVisible: boolean
	chapterTopicFeed: T
}
export type PodcastEpisodeChaptersProps<T> = {
	podcastEpisode: PodcastEpisode
	playerChapterIndex: number | null
	isExpanded: boolean
	chapterTopicFeed: T
}

/**
 * Composes chapter rows with shared expansion, stable identity, and current-chapter selection.
 */
export function PodcastEpisodeChapters<T>({
	podcastEpisode,
	playerChapterIndex,
	isExpanded,
	chapterTopicFeed,
	List,
	Row,
}: PodcastEpisodeChaptersProps<T> & {
	List: ComponentType<{ children: ReactNode }>
	Row: ComponentType<PodcastEpisodeChapterRowProps<T>>
}) {
	return (
		<List>
			{podcastEpisode.chapters.map((chapter, index) => (
				<Row
					key={`${podcastEpisode.id}-${chapter.position}`}
					podcastEpisode={podcastEpisode}
					chapter={chapter}
					isPlayerChapter={index === playerChapterIndex}
					isHiddenUntilExpanded={index >= SHOWN_CHAPTER_COUNT && !isExpanded}
					isLastVisible={
						index ===
						(isExpanded
							? podcastEpisode.chapters.length
							: Math.min(SHOWN_CHAPTER_COUNT, podcastEpisode.chapters.length)) -
							1
					}
					chapterTopicFeed={chapterTopicFeed}
				/>
			))}
		</List>
	)
}

/**
 * Formats the chapter's source and bounded playback times identically in both apps.
 */
export function toPodcastEpisodeChapterSourceLabel(chapter: PodcastEpisodeChapter): string {
	return `${toHostWithoutWww(chapter.sourceUrl)} · ${toClockLabel(chapter.startSeconds)} to ${toClockLabel(chapter.endSeconds)}`
}

export type ChapterTopicFeed = {
	topicFindings: TopicFinding[]
	topic: Pick<TopicResponse, "id" | "name" | "prompt" | "visibility">
	isRatable: boolean
	isBookmarkable: boolean
	topicFeedHandlers: TopicFeedHandlers
}
