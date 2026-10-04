import type { PodcastEpisode, PodcastEpisodeChapter } from "@shared/contracts"
import { Headphones } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	playPodcastEpisode,
	togglePlayback,
	togglePodcastEpisodePlayback,
	usePlayerChapter,
	usePodcastEpisodePlayer,
} from "@/stores/podcastEpisodePlayerStore"

// the style that every podcast episode pill shares, with a button's shadow
const PILL_CLASS = "shadow-lift inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"

// a pill's colors while its podcast episode or chapter plays, and a pill's border otherwise.
// the border keeps the pill visible on a highlighted row
const HIGHLIGHTED_PILL_CLASS = "bg-primary text-primary-foreground border-transparent font-bold"
const IDLE_PILL_BORDER_CLASS = "border-separator-strong"

// the podcast episode, the chapter that the pill plays, and the pill's own classes
type PodcastEpisodeChapterPillProps = {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
	className?: string
}

/**
 * The pill of a podcast episode chapter, on the finding that the chapter narrates and on the chapter's own row.
 * A click plays or pauses the chapter.
 */
export function PodcastEpisodeChapterPill({ podcastEpisode, chapter, className }: PodcastEpisodeChapterPillProps) {
	// whether the player is at the chapter, and whether the chapter is playing
	const { podcastEpisode: loadedPodcastEpisode, isPlaying } = usePodcastEpisodePlayer()
	const playerChapter = usePlayerChapter()
	const isPlayerChapter = loadedPodcastEpisode?.id === podcastEpisode.id && playerChapter?.position === chapter.position
	const isChapterPlaying = isPlayerChapter && isPlaying

	// the button's label, which names the action, the podcast episode, and the chapter
	const playbackAction = isChapterPlaying ? "Pause" : "Play"
	const chapterPillLabel = `${playbackAction} episode ${podcastEpisode.episodeNumber}, chapter ${chapter.position + 1}`
	return (
		<button
			type="button"
			aria-label={chapterPillLabel}
			// keep the click from the row behind the pill. pause or play the player's chapter,
			// and play the podcast episode from any other chapter
			onClick={(event) => {
				event.stopPropagation()
				if (isPlayerChapter) {
					togglePlayback()
				} else {
					void playPodcastEpisode(podcastEpisode, chapter.startSeconds)
				}
			}}
			className={cn(
				PILL_CLASS,
				isChapterPlaying ? HIGHLIGHTED_PILL_CLASS : [IDLE_PILL_BORDER_CLASS, "bg-muted text-primary"],
				className,
			)}
		>
			<Headphones className="size-3" strokeWidth={2.5} />
			{`E${podcastEpisode.episodeNumber} · ch ${chapter.position + 1}`}
		</button>
	)
}

/**
 * The pill on the loaded podcast episode, which reads "Playing" or "Paused". A click pauses or plays the episode.
 */
export function PodcastEpisodePlaybackPill() {
	const { isPlaying } = usePodcastEpisodePlayer()
	return (
		<button
			type="button"
			aria-label={isPlaying ? "Playing. Pause" : "Paused. Play"}
			// keep the click from the row behind the pill
			onClick={(event) => {
				event.stopPropagation()
				togglePlayback()
			}}
			className={cn(PILL_CLASS, HIGHLIGHTED_PILL_CLASS, "hover:bg-primary/90")}
		>
			{isPlaying ? "Playing" : "Paused"}
		</button>
	)
}

/**
 * Returns whether the chapter that narrates this finding is playing.
 */
export function useIsFindingChapterPlaying(
	podcastEpisode: PodcastEpisode | null | undefined,
	findingId: string,
): boolean {
	const { podcastEpisode: loadedPodcastEpisode, isPlaying } = usePodcastEpisodePlayer()
	const playerChapter = usePlayerChapter()
	if (!podcastEpisode || loadedPodcastEpisode?.id !== podcastEpisode.id || !isPlaying) {
		return false
	}
	return playerChapter?.findingId === findingId
}

/**
 * The pill with a podcast episode's number. A click plays or pauses the episode.
 */
export function PodcastEpisodeNumberPill({
	podcastEpisode,
	className,
}: {
	podcastEpisode: { id: string; episodeNumber: number }
	className?: string
}) {
	// whether this pill's podcast episode is the loaded episode and playing
	const { podcastEpisode: loadedPodcastEpisode, isPlaying } = usePodcastEpisodePlayer()
	const isPodcastEpisodePlaying = loadedPodcastEpisode?.id === podcastEpisode.id && isPlaying
	return (
		<button
			type="button"
			aria-label={`${isPodcastEpisodePlaying ? "Pause" : "Play"} episode ${podcastEpisode.episodeNumber}`}
			onClick={() => void togglePodcastEpisodePlayback(podcastEpisode.id)}
			className={cn(
				PILL_CLASS,
				isPodcastEpisodePlaying ? HIGHLIGHTED_PILL_CLASS : [IDLE_PILL_BORDER_CLASS, "bg-muted text-link"],
				className,
			)}
		>
			<Headphones className="size-3" strokeWidth={2.5} />
			{`E${podcastEpisode.episodeNumber}`}
		</button>
	)
}
