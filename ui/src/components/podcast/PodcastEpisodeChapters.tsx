import type { PodcastEpisode, PodcastEpisodeChapter, TopicFinding } from "@shared/contracts"
import { toHostWithoutWww } from "@shared/seo"
import { useState } from "react"
import { sendPodcastEpisodeChapterRating } from "@/clients/podcastEpisodeClient"
import { RatingThumbs } from "@/components/common/RatingThumbs"
import { PodcastEpisodeChapterPill } from "@/components/podcast/PodcastEpisodePill"
import { Popover, PopoverAnchor, PopoverTrigger } from "@/components/primitives/popover"
import { ResourceInfo } from "@/components/topic/TopicResource"
import { toClockLabel } from "@/lib/labels"
import { DASHED_ROW_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { playPodcastEpisode } from "@/stores/podcastEpisodePlayerStore"

// how many podcast episode chapters to show before the list is expanded
export const SHOWN_CHAPTER_COUNT = 3

// where a chapter's number sits in its row
const CHAPTER_NUMBER_SLOT_CLASS =
	"text-muted-foreground absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"

// where a chapter's thumbs sit in its row, over the row's click area. a phone shows no chapter thumbs
const THUMBS_SLOT_CLASS = "relative z-10 hidden shrink-0 items-center gap-2 pr-3 sm:flex"

// what a chapter's topic finding note reads. the topic's findings that the user sees, the topic that a note names,
// whether the user may rate and bookmark the findings, and the calls behind the note's buttons
export type ChapterTopicFeed = {
	topicFindings: TopicFinding[]
	topic: { id: string; name: string; prompt: string }
	isRatable: boolean
	isBookmarkable: boolean
	topicHandlers: TopicFeedHandlers
}

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
		// the rows run close to the card's side edges, and to the card's bottom edge on a wide screen
		<ol aria-label="Chapters" className="-mx-4 sm:-mb-4">
			{podcastEpisode.chapters.map((chapter, chapterIndex) => (
				<PodcastEpisodeChapterRow
					key={`${podcastEpisode.id}-${chapter.position}`}
					podcastEpisode={podcastEpisode}
					chapter={chapter}
					isPlayerChapter={chapterIndex === playerChapterIndex}
					isHiddenUntilExpanded={chapterIndex >= SHOWN_CHAPTER_COUNT && !isExpanded}
					chapterTopicFeed={chapterTopicFeed}
				/>
			))}
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
	const { topicFindings, isRatable, topicHandlers } = chapterTopicFeed
	const chapterTopicFinding = topicFindings.find((topicFinding) => topicFinding.findingId === chapter.findingId)
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const chapterTimesLabel = `${toClockLabel(chapter.startSeconds)} to ${toClockLabel(chapter.endSeconds)}`
	const chapterSourceLabel = `${toHostWithoutWww(chapter.sourceUrl)} · ${chapterTimesLabel}`

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
				"isolate flex items-center before:absolute before:inset-0 before:-z-10 before:rounded-lg",
				"hover:before:bg-accent-foreground/20 before:transition-colors",
				chapterTopicFinding && "cursor-pointer",
				// the player's chapter stays highlighted
				isPlayerChapter && "before:bg-muted/70",
				// every chapter is in the html. with JavaScript, the rows past the first few hide until the list expands
				isHiddenUntilExpanded && "scripted:hidden",
			)}
		>
			{/* the chapter's number */}
			<span className={CHAPTER_NUMBER_SLOT_CLASS} aria-hidden="true">
				<span className={cn("font-display text-sm tabular-nums", isPlayerChapter && "text-primary font-bold")}>
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
							"truncate text-left hover:underline",
							!chapterTopicFinding && "after:absolute after:inset-0",
							isPlayerChapter && "text-primary",
						)}
					>
						{chapter.title}
					</button>
				</div>
				{/* the source and times, then the pill that plays the chapter, over the row's click area */}
				<div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
					{chapterTopicFinding ? (
						<PopoverTrigger asChild>
							<button type="button" className="min-w-0 truncate text-left">
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
							onRate={(rating) => topicHandlers.rateTopicFinding(chapterTopicFinding.findingId, rating)}
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
	const { topic, isRatable, isBookmarkable, topicHandlers } = chapterTopicFeed
	return (
		<>
			<PopoverAnchor className="pointer-events-none absolute top-1.5 right-1 size-11 sm:size-8" />
			{isNoteOpen && (
				<ResourceInfo
					resource={topicFinding}
					topicFindingRank={null}
					podcastEpisode={podcastEpisode}
					topic={topic}
					isRatable={isRatable}
					isBookmarkable={isBookmarkable}
					topicHandlers={topicHandlers}
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
	const [rating, setRating] = useState(chapter.rating)

	// show the new rating, then save it, and show the previous rating again if the save fails
	const handleRateChapter = async (nextRating: "up" | "down" | null): Promise<void> => {
		const previousRating = rating
		setRating(nextRating)
		const isRatingSaved = await sendPodcastEpisodeChapterRating({
			podcastEpisodeId,
			position: chapter.position,
			rating: nextRating,
		})
		if (!isRatingSaved) {
			setRating(previousRating)
		}
	}
	return (
		<RatingThumbs
			rating={rating}
			onRate={(nextRating) => void handleRateChapter(nextRating)}
			ariaLabelSuffix={`, chapter ${chapter.position + 1}`}
		/>
	)
}
