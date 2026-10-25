import type { PodcastEpisodeNote } from "@carlnotes/contracts/chatQuestionNotes"
import type { PodcastEpisodeChapterRef } from "@carlnotes/contracts/payloads"
import { cn } from "@carlnotes/nightshift/classNames"
import { Headphones } from "lucide-react"
import { IconButton } from "@/components/common/IconButton"
import { QUESTION_BUBBLE_WIDTH_CLASS } from "@/lib/styleClasses"
import { playPodcastEpisodeChapter } from "@/stores/podcastEpisodePlayActions"

/**
 * The small tag under a question asked from the podcast player, naming the podcast episode and the chapter it was asked
 * during. A tap plays the podcast episode from the start of that chapter.
 */
export function PodcastEpisodeChapterTag({
	podcastEpisodeChapter,
	podcastEpisodeNote,
}: {
	// the podcast episode and chapter the stored row names, which the tap plays
	podcastEpisodeChapter: PodcastEpisodeChapterRef
	// the note the stored question ends with, whose titles the tag shows
	podcastEpisodeNote: PodcastEpisodeNote
}) {
	const chapterNumber = podcastEpisodeChapter.chapterPosition + 1
	const tagLabel = `Play ${podcastEpisodeNote.podcastEpisodeTitle} from chapter ${chapterNumber}`
	return (
		<IconButton
			tooltip={tagLabel}
			onClick={() =>
				void playPodcastEpisodeChapter(podcastEpisodeChapter.podcastEpisodeId, podcastEpisodeChapter.chapterPosition)
			}
			className={cn(
				"bg-muted text-muted-foreground hover:text-foreground mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs sm:min-h-7",
				QUESTION_BUBBLE_WIDTH_CLASS,
			)}
		>
			<Headphones className="size-3.5 shrink-0" />
			<span className="truncate">
				{`${podcastEpisodeNote.podcastEpisodeTitle} · Ch ${chapterNumber} · ${podcastEpisodeNote.chapterTitle}`}
			</span>
		</IconButton>
	)
}
