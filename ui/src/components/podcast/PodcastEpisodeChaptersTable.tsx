import type { PodcastEpisode, PodcastEpisodeChapter, TopicFinding } from "@shared/contracts"
import { toHostWithoutWww } from "@shared/seo"
import { Pause, Play } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { HostFavicon } from "@/components/common/HostFavicon"
import { type ChapterTopicFeed, ChapterTopicFindingNote } from "@/components/podcast/PodcastEpisodeChapters"
import { Popover } from "@/components/primitives/popover"
import { TableCard } from "@/components/table/TableCard"
import { SMALLEST_PAGE_SIZE, TablePagination, usePagination } from "@/components/table/TablePagination"
import { TopicFindingSummary } from "@/components/topic/TopicResource"
import { toClockLabel, toCountLabel } from "@/lib/labels"
import {
	PLAY_BUTTON_CLASS,
	PLAY_BUTTON_MUTED_CLASS,
	TABLE_CLASS,
	TABLE_HEAD_CLASS,
	TABLE_SCROLL_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import {
	playPodcastEpisode,
	togglePlayback,
	usePlayerChapter,
	usePodcastEpisodePlayer,
} from "@/stores/podcastEpisodePlayerStore"

// a chapter's source link, in muted text
const CHAPTER_SOURCE_CLASS =
	"text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs hover:underline"

// the chapter column, wide enough for a play button beside a title.
// the important modifier overrides the table's own width for its first column
const CHAPTER_COLUMN_CLASS = "min-w-64! max-w-64!"

// the podcast episode, and what its chapters' topic finding notes read
type PodcastEpisodeChaptersTableProps = { podcastEpisode: PodcastEpisode; chapterTopicFeed: ChapterTopicFeed }

/**
 * A podcast episode's chapters as a table, over a row of totals. A row opens its topic finding's note.
 */
export function PodcastEpisodeChaptersTable({ podcastEpisode, chapterTopicFeed }: PodcastEpisodeChaptersTableProps) {
	// the chapters, and the page of chapter rows that the pagination shows
	const { chapters } = podcastEpisode
	const { pageRows, ...pagination } = usePagination(chapters)

	// the position of the chapter that the player is at, if this podcast episode is the loaded one
	const { podcastEpisode: loadedPodcastEpisode, isPlaying } = usePodcastEpisodePlayer()
	const playerChapter = usePlayerChapter()
	const playerChapterPosition = loadedPodcastEpisode?.id === podcastEpisode.id ? playerChapter?.position : undefined

	// pause or play the player's chapter, and play the podcast episode from any other chapter
	const handleTogglePlayback = (chapter: PodcastEpisodeChapter): void => {
		if (chapter.position === playerChapterPosition) {
			togglePlayback()
		} else {
			void playPodcastEpisode(podcastEpisode, chapter.startSeconds)
		}
	}

	// how long the chapters run in total, and how many hosts their sources come from
	const totalChapterSeconds = chapters.reduce((sum, chapter) => sum + chapter.endSeconds - chapter.startSeconds, 0)
	const sourceHostCount = new Set(chapters.map((chapter) => toHostWithoutWww(chapter.sourceUrl))).size
	return (
		<TableCard>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-2xl")}>
					{/* the column headings */}
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<th className={cn(CHAPTER_COLUMN_CLASS, "py-2 pr-4 font-normal")}>Chapter</th>
							<th className="py-2 pr-4 font-normal">Starts</th>
							<th className="py-2 pr-4 font-normal">Length</th>
							<th className="py-2 font-normal">Topic Finding</th>
						</tr>
					</thead>
					{/* every chapter is in the html. with JavaScript, only the rows of the page shown stay visible */}
					<tbody>
						{chapters.map((chapter) => (
							<PodcastEpisodeChapterRow
								key={chapter.position}
								chapter={chapter}
								className={cn(!pageRows.includes(chapter) && "scripted:hidden")}
								topicFinding={chapterTopicFeed.topicFindings.find(
									(topicFinding) => topicFinding.findingId === chapter.findingId,
								)}
								isPlayerChapter={chapter.position === playerChapterPosition}
								isChapterPlaying={chapter.position === playerChapterPosition && isPlaying}
								onTogglePlayback={() => handleTogglePlayback(chapter)}
								chapterTopicFeed={chapterTopicFeed}
							/>
						))}
					</tbody>
					{/* the totals row */}
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">{toCountLabel(chapters.length, "chapter")}</td>
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4 tabular-nums">{toClockLabel(totalChapterSeconds)}</td>
							<td className="py-2">{toCountLabel(sourceHostCount, "source")}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			{/* the pagination, shown only with JavaScript */}
			{chapters.length > SMALLEST_PAGE_SIZE && (
				<div className="hidden scripted:block">
					<TablePagination {...pagination} />
				</div>
			)}
		</TableCard>
	)
}

// a chapter, its topic finding if the topic still has the finding, whether the player is at the chapter,
// whether the chapter is playing, the call that plays or pauses the chapter, and what the finding's note needs
type PodcastEpisodeChapterRowProps = {
	chapterTopicFeed: ChapterTopicFeed
	chapter: PodcastEpisodeChapter
	topicFinding: TopicFinding | undefined
	isPlayerChapter: boolean
	isChapterPlaying: boolean
	className?: string
	onTogglePlayback: () => void
}

// one chapter's row. a click on the row opens the note of the chapter's topic finding.
// a chapter with no topic finding shows its source's favicon and host
function PodcastEpisodeChapterRow({
	chapter,
	topicFinding,
	isPlayerChapter,
	isChapterPlaying,
	className,
	onTogglePlayback,
	chapterTopicFeed,
}: PodcastEpisodeChapterRowProps) {
	// whether the finding's note is open, and the cells that every chapter's row has
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const chapterCells = (
		<>
			<td className={cn(CHAPTER_COLUMN_CLASS, "py-2 pr-4 font-semibold")}>
				<div className="flex items-center gap-3">
					{/* the play button, in the primary color on the player's chapter. the button keeps its click from the row */}
					<button
						type="button"
						aria-label={`${isChapterPlaying ? "Pause" : "Play"} chapter ${chapter.position + 1}`}
						onClick={(event) => {
							event.stopPropagation()
							onTogglePlayback()
						}}
						className={cn(PLAY_BUTTON_CLASS, "size-11 sm:size-9", !isPlayerChapter && PLAY_BUTTON_MUTED_CLASS)}
					>
						{isChapterPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
					</button>
					{chapter.title}
				</div>
			</td>
			{/* the chapter's start and length */}
			<td className="text-muted-foreground py-2 pr-4 tabular-nums">{toClockLabel(chapter.startSeconds)}</td>
			<td className="text-muted-foreground py-2 pr-4 tabular-nums">
				{toClockLabel(chapter.endSeconds - chapter.startSeconds)}
			</td>
		</>
	)

	// a chapter with no topic finding links to its source
	if (!topicFinding) {
		return (
			<tr className={cn("border-b", className)}>
				{chapterCells}
				<td className="py-2">
					<AnchorLink href={chapter.sourceUrl} isUserContent className={CHAPTER_SOURCE_CLASS}>
						<HostFavicon faviconPath={chapter.faviconPath} />
						{toHostWithoutWww(chapter.sourceUrl)}
					</AnchorLink>
				</td>
			</tr>
		)
	}
	return (
		<Popover open={isNoteOpen} onOpenChange={setIsNoteOpen}>
			{/* the row is a pointer shortcut to the note. a keyboard user opens the note from the finding's title */}
			<tr onClick={() => setIsNoteOpen(true)} className={cn("group cursor-pointer border-b", className)}>
				{chapterCells}
				{/* the topic finding's summary. the cell takes half the table and truncates the title */}
				<td className="relative w-1/2 max-w-0 py-2">
					<TopicFindingSummary resource={topicFinding} isResourceKindIconShown={false} />
					{/* the topic finding's note */}
					<ChapterTopicFindingNote
						topicFinding={topicFinding}
						isNoteOpen={isNoteOpen}
						chapterTopicFeed={chapterTopicFeed}
					/>
				</td>
			</tr>
		</Popover>
	)
}
