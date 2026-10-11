import type { TopicFinding } from "@shared/contracts/findings"
import type { PodcastEpisode, PodcastEpisodeChapter } from "@shared/contracts/podcast"
import { toHostWithoutWww } from "@shared/seo"
import { Pause, Play } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { HostFavicon } from "@/components/common/HostFavicon"
import { type ChapterTopicFeed, ChapterTopicFindingNote } from "@/components/podcast/PodcastEpisodeChapters"
import { Popover } from "@/components/primitives/popover"
import { TableCard } from "@/components/table/TableCard"
import { ScriptedTablePagination, usePagination } from "@/components/table/TablePagination"
import { TopicFindingSummary } from "@/components/topic/TopicFindingSummary"
import { toClockLabel, toCountLabel } from "@/lib/labels"
import {
	PLAY_BUTTON_CLASS,
	PLAY_BUTTON_MUTED_CLASS,
	TABLE_CLASS,
	TABLE_HEAD_CLASS,
	TABLE_SCROLL_CLASS,
	TABLE_WIDE_FIRST_COLUMN_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import {
	togglePodcastEpisodeChapterPlayback,
	usePlayerChapter,
	usePodcastEpisodePlayer,
} from "@/stores/podcastEpisodePlayerStore"

// a chapter's source link, in muted text
const CHAPTER_SOURCE_CLASS =
	"text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs hover:underline"

// the podcast episode, and what its chapters' topic finding notes read
type PodcastEpisodeChaptersTableProps = { podcastEpisode: PodcastEpisode; chapterTopicFeed: ChapterTopicFeed }

/**
 * A podcast episode's chapters as a table, over a row of totals. A row opens its topic finding's note.
 */
export function PodcastEpisodeChaptersTable({ podcastEpisode, chapterTopicFeed }: PodcastEpisodeChaptersTableProps) {
	// the chapters, and the rows the table renders for the page shown
	const { chapters } = podcastEpisode
	const { renderedRows, pagination } = usePagination(chapters)

	// the position of the chapter that the player is at, if this podcast episode is the loaded one
	const { podcastEpisode: loadedPodcastEpisode, isPlaying } = usePodcastEpisodePlayer()
	const playerChapter = usePlayerChapter()
	const playerChapterPosition = loadedPodcastEpisode?.id === podcastEpisode.id ? playerChapter?.position : undefined

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
							<th className={cn(TABLE_WIDE_FIRST_COLUMN_CLASS, "py-2 pr-4 font-normal")}>Chapter</th>
							<th className="py-2 pr-4 font-normal">Starts</th>
							<th className="py-2 pr-4 font-normal">Length</th>
							<th className="py-2 font-normal">Topic Finding</th>
						</tr>
					</thead>
					{/* the page's chapters and the first NO_SCRIPT_ROW_LIMIT are in the html.
						with JavaScript, only the rows of the page shown stay visible */}
					<tbody>
						{renderedRows.map(({ row: chapter, className }) => (
							<PodcastEpisodeChapterRow
								key={chapter.position}
								chapter={chapter}
								className={className}
								topicFinding={chapterTopicFeed.topicFindings.find(
									(topicFinding) => topicFinding.findingId === chapter.findingId,
								)}
								isPlayerChapter={chapter.position === playerChapterPosition}
								isChapterPlaying={chapter.position === playerChapterPosition && isPlaying}
								onTogglePlayback={() => togglePodcastEpisodeChapterPlayback(podcastEpisode, chapter)}
								podcastEpisode={podcastEpisode}
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
			<ScriptedTablePagination {...pagination} />
		</TableCard>
	)
}

// the podcast episode, a chapter, its topic finding if the topic still has the finding, and the player's state for the chapter.
// the call that plays or pauses the chapter, and what the finding's note needs
type PodcastEpisodeChapterRowProps = {
	podcastEpisode: PodcastEpisode
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
	podcastEpisode,
	chapterTopicFeed,
}: PodcastEpisodeChapterRowProps) {
	// whether the finding's note is open, and the cells that every chapter's row has
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const chapterCells = (
		<>
			<td className={cn(TABLE_WIDE_FIRST_COLUMN_CLASS, "py-2 pr-4 font-semibold")}>
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
						podcastEpisode={podcastEpisode}
						topicFinding={topicFinding}
						isNoteOpen={isNoteOpen}
						chapterTopicFeed={chapterTopicFeed}
					/>
				</td>
			</tr>
		</Popover>
	)
}
