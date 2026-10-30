import {
	type ChapterTopicFeed,
	PodcastEpisodeChapters as SharedPodcastEpisodeChapters,
	toPodcastEpisodeChapterSourceLabel,
} from "@carlnotes/core/components/PodcastEpisodeChapters"
import { usePodcastEpisodeChapterRating } from "@carlnotes/core/hooks/usePodcastEpisodeChapterRating"

export { SHOWN_CHAPTER_COUNT } from "@carlnotes/core/components/PodcastEpisodeChapters"

import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { useState } from "react"
import { RatingThumbs } from "@/components/common/RatingThumbs"
import { Popover, PopoverAnchor, PopoverTrigger } from "@/components/primitives/popover"
import { TopicResourceInfo } from "@/components/topic/TopicResourceInfo"
import {
	DASHED_ROW_CLASS,
	LIST_ROW_HIGHLIGHTED_CLASS,
	LIST_ROW_HOVER_CLASS,
	SCRIPTED_HIDDEN_CLASS,
} from "@/lib/styleClasses"
import { playPodcastEpisode } from "@/stores/podcastEpisodePlayerStore"
import { PodcastEpisodeChapterPill } from "./PodcastEpisodePill"

// where a chapter's number sits in its row
const CHAPTER_NUMBER_SLOT_CLASS =
	"text-muted-foreground absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"

// where a chapter's thumbs sit in its row, over the row's click area. a phone shows no chapter thumbs
const THUMBS_SLOT_CLASS = "relative z-10 hidden shrink-0 items-center gap-2 pr-3 sm:flex"

export type { ChapterTopicFeed } from "@carlnotes/core/components/PodcastEpisodeChapters"

// the podcast episode, the player's chapter index or null if the episode is not loaded, whether the list is expanded,
// and what the chapters' topic finding notes read
type PodcastEpisodeChaptersProps = {
	podcastEpisode: PodcastEpisode
	playerChapterIndex: number | null
	isExpanded: boolean
	chapterTopicFeed: ChapterTopicFeed
}

/**
 * A podcast episode's chapters as a list. A row opens its topic finding's note, and its title and its pill play the
 * chapter.
 * Its thumbs rate the finding, or the chapter itself once its finding was filtered out.
 */
export function PodcastEpisodeChapters({
	podcastEpisode,
	playerChapterIndex,
	isExpanded,
	chapterTopicFeed,
}: PodcastEpisodeChaptersProps) {
	return (
		<SharedPodcastEpisodeChapters
			podcastEpisode={podcastEpisode}
			playerChapterIndex={playerChapterIndex}
			isExpanded={isExpanded}
			chapterTopicFeed={chapterTopicFeed}
			List={ChapterList}
			Row={PodcastEpisodeChapterRow}
		/>
	)
}

// retain every chapter in server-rendered HTML and collapse rows only after hydration
function ChapterList({ children }: { children: React.ReactNode }) {
	return (
		<ol aria-label="Chapters" className="-mx-4 sm:-mb-4">
			{children}
		</ol>
	)
}

// the podcast episode, the chapter, whether the player is at the chapter,
// whether the row hides until the list expands, and what the chapter's topic finding note reads
type PodcastEpisodeChapterRowProps = {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
	isPlayerChapter: boolean
	isHiddenUntilExpanded: boolean
	chapterTopicFeed: ChapterTopicFeed
}

// one chapter's row. a click on the row opens the note of the chapter's topic finding,
// and a click on the title or the pill plays the chapter. a chapter whose finding the user cannot see plays from its
// whole row
function PodcastEpisodeChapterRow({
	podcastEpisode,
	chapter,
	isPlayerChapter,
	isHiddenUntilExpanded,
	chapterTopicFeed,
}: PodcastEpisodeChapterRowProps) {
	// the chapter's topic finding if the user sees it, whether its note is open, and the chapter's source and times
	const { topicFindings, isRatable, topicFeedHandlers } = chapterTopicFeed
	const chapterTopicFinding = topicFindings.find((topicFinding) => topicFinding.findingId === chapter.findingId)
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const chapterSourceLabel = toPodcastEpisodeChapterSourceLabel(chapter)

	// open the note from a click anywhere on the row except its buttons
	const handleRowClick = (event: React.MouseEvent<HTMLLIElement>): void => {
		if (chapterTopicFinding && !(event.target as HTMLElement).closest("button")) {
			setIsNoteOpen(true)
		}
	}
	const chapterRow = (
		// biome-ignore lint/a11y/useKeyWithClickEvents: reachable by keyboard through the source line's trigger
		<li
			aria-current={isPlayerChapter ? "true" : undefined}
			onClick={handleRowClick}
			className={cn(
				DASHED_ROW_CLASS,
				LIST_ROW_HOVER_CLASS,
				"flex items-center",
				chapterTopicFinding && "cursor-pointer",
				// the player's chapter stays highlighted
				isPlayerChapter && LIST_ROW_HIGHLIGHTED_CLASS,
				// every chapter is in the html. with JavaScript, the rows past the first few hide until the list expands
				isHiddenUntilExpanded && SCRIPTED_HIDDEN_CLASS,
			)}
		>
			{/* the chapter's number */}
			<span className={CHAPTER_NUMBER_SLOT_CLASS} aria-hidden="true">
				<span className={cn("font-display text-sm tabular-nums", isPlayerChapter && "text-link font-bold")}>
					{chapter.position + 1}
				</span>
			</span>
			{/* the chapter's title, which plays the chapter, and its source and times, which open the note.
			    with no note, the title's click area covers the row */}
			<div className="min-w-0 flex-1 py-3 pr-3 pl-9">
				<div className="flex items-center gap-2 text-sm font-bold">
					<button
						type="button"
						onClick={() => void playPodcastEpisode(podcastEpisode, chapter.startSeconds)}
						className={cn(
							// a 24-pixel-tall target that grows up into the row's padding, clear of the source label below
							"-mt-1 truncate pt-1 text-left hover:underline",
							!chapterTopicFinding && "after:absolute after:inset-0",
							isPlayerChapter && "text-link",
						)}
					>
						{chapter.title}
					</button>
				</div>
				{/* the source and times, then the pill that plays the chapter, over the row's click area */}
				<div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
					{chapterTopicFinding ? (
						// the source label, a 24-pixel-tall target that grows down into the row's padding, clear of the title
						<PopoverTrigger asChild>
							<button type="button" className="-mb-2 min-w-0 truncate pb-2 text-left">
								{chapterSourceLabel}
							</button>
						</PopoverTrigger>
					) : (
						<span className="min-w-0 truncate">{chapterSourceLabel}</span>
					)}
					<PodcastEpisodeChapterPill
						podcastEpisode={podcastEpisode}
						chapter={chapter}
						className="relative z-10 shrink-0"
					/>
				</div>
			</div>
			{/* the thumbs over the row's click area, which rate the chapter's finding,
			    or the chapter itself once its finding was filtered out */}
			{isRatable && (chapterTopicFinding || chapter.findingId === null) && (
				<div className={THUMBS_SLOT_CLASS}>
					{chapterTopicFinding ? (
						<RatingThumbs
							rating={chapterTopicFinding.rating}
							onRate={(rating) => topicFeedHandlers.rateTopicFinding(chapterTopicFinding.findingId, rating)}
							ariaLabelSuffix={`, chapter ${chapter.position + 1}`}
						/>
					) : (
						<PodcastEpisodeChapterThumbs podcastEpisodeId={podcastEpisode.id} chapter={chapter} />
					)}
				</div>
			)}
			{/* the note of the chapter's topic finding */}
			{chapterTopicFinding && (
				<ChapterTopicFindingNote
					podcastEpisode={podcastEpisode}
					topicFinding={chapterTopicFinding}
					isNoteOpen={isNoteOpen}
					chapterTopicFeed={chapterTopicFeed}
				/>
			)}
		</li>
	)

	// a chapter with a topic finding is the anchor of the finding's note
	return chapterTopicFinding ? (
		<Popover open={isNoteOpen} onOpenChange={setIsNoteOpen}>
			{chapterRow}
		</Popover>
	) : (
		chapterRow
	)
}

// the podcast episode whose chapter pill the note shows, the chapter's topic finding, whether its note is open,
// and what the note reads
type ChapterTopicFindingNoteProps = {
	podcastEpisode: PodcastEpisode
	topicFinding: TopicFinding
	isNoteOpen: boolean
	chapterTopicFeed: ChapterTopicFeed
}

/**
 * A chapter's topic finding note, anchored at its row's right edge.
 * The note mounts only while open, so its link preview loads then.
 */
export function ChapterTopicFindingNote({
	podcastEpisode,
	topicFinding,
	isNoteOpen,
	chapterTopicFeed,
}: ChapterTopicFindingNoteProps) {
	const { topic, isRatable, isBookmarkable, topicFeedHandlers } = chapterTopicFeed
	return (
		<>
			<PopoverAnchor className="pointer-events-none absolute top-1.5 right-1 size-11 sm:size-8" />
			{isNoteOpen && (
				<TopicResourceInfo
					resource={topicFinding}
					topicFindingRank={null}
					podcastEpisode={podcastEpisode}
					topic={topic}
					isRatable={isRatable}
					isBookmarkable={isBookmarkable}
					topicFeedHandlers={topicFeedHandlers}
				/>
			)}
		</>
	)
}

// the podcast episode and the chapter that the thumbs rate
type PodcastEpisodeChapterThumbsProps = { podcastEpisodeId: string; chapter: PodcastEpisodeChapter }

// the thumbs that rate a chapter whose finding was filtered out.
// the new rating shows at once and goes back if it fails to save
function PodcastEpisodeChapterThumbs({ podcastEpisodeId, chapter }: PodcastEpisodeChapterThumbsProps) {
	const { rating, isSaving, rate } = usePodcastEpisodeChapterRating(podcastEpisodeId, chapter)
	return (
		<RatingThumbs
			rating={rating}
			isDisabled={isSaving}
			onRate={(nextRating) => void rate(nextRating)}
			ariaLabelSuffix={`, chapter ${chapter.position + 1}`}
		/>
	)
}
