import type { PodcastEpisode, PodcastEpisodeChapter, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentType, ReactNode } from "react"
import { togglePodcastEpisodeChapterPlayback, togglePodcastEpisodePlayback } from "../stores/podcastEpisodePlayActions"
import {
	togglePlayback,
	useIsPodcastEpisodePlaying,
	usePlayerChapter,
	usePlayerChapterPosition,
	usePodcastEpisodePlayer,
} from "../stores/podcastEpisodePlayerStore"

export type PodcastEpisodePillElements = {
	Button: ComponentType<{
		children: ReactNode
		label: string
		onPress: () => void
		className: string
		isHighlighted: boolean
	}>
	Body: ComponentType<{ text: string; isPlaying: boolean }>
	Tooltip: ComponentType<{ children: ReactNode; podcastEpisode: PodcastEpisodeSummary }>
}
export type FindingChapterPillProps = {
	podcastEpisode?: PodcastEpisode | null
	findingId: string
	className?: string
}

// the pill's shape and its highlighted and idle colors. the pill is at least 24 pixels tall, a large enough target
// with text right above it
const PILL_CLASS =
	"shadow-raised inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
const HIGHLIGHTED_PILL_CLASS = "bg-primary text-primary-foreground border-transparent font-bold"
const IDLE_PILL_CLASS = "border-separator-strong bg-muted text-link"

/**
 * Composes a chapter pill with the shared toggle behavior and current chapter highlighting.
 */
export function PodcastEpisodeChapterPill({
	podcastEpisode,
	chapter,
	className,
	elements: { Button, Body },
}: {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
	className?: string
	elements: PodcastEpisodePillElements
}) {
	const { isPlaying } = usePodcastEpisodePlayer()
	const isChapterPlaying = usePlayerChapterPosition(podcastEpisode.id) === chapter.position && isPlaying

	// the pill's text and its playback action. the accessible name starts with the text, so a voice command that says
	// the text finds the pill
	const pillText = `E${podcastEpisode.episodeNumber} · ch ${chapter.position + 1}`
	const actionText = `${isChapterPlaying ? "pause" : "play"} episode ${podcastEpisode.episodeNumber}, chapter ${chapter.position + 1}`
	return (
		<Button
			label={`${pillText}, ${actionText}`}
			onPress={() => togglePodcastEpisodeChapterPlayback(podcastEpisode, chapter)}
			isHighlighted={isChapterPlaying}
			className={cn(PILL_CLASS, isChapterPlaying ? HIGHLIGHTED_PILL_CLASS : IDLE_PILL_CLASS, className)}
		>
			<Body text={pillText} isPlaying={isChapterPlaying} />
		</Button>
	)
}

/**
 * Composes the episode-number pill and its detail tooltip.
 */
export function PodcastEpisodeNumberPill({
	podcastEpisode,
	className,
	elements: { Button, Body, Tooltip },
}: {
	podcastEpisode: PodcastEpisodeSummary
	className?: string
	elements: PodcastEpisodePillElements
}) {
	const isPlaying = useIsPodcastEpisodePlaying(podcastEpisode.id)

	// the pill's text and its playback action. the accessible name starts with the text, as the chapter pill's does
	const pillText = `E${podcastEpisode.episodeNumber}`
	const actionText = `${isPlaying ? "pause" : "play"} episode ${podcastEpisode.episodeNumber}`
	return (
		<Tooltip podcastEpisode={podcastEpisode}>
			<Button
				label={`${pillText}, ${actionText}`}
				onPress={() => void togglePodcastEpisodePlayback(podcastEpisode.id)}
				isHighlighted={isPlaying}
				className={cn(PILL_CLASS, isPlaying ? HIGHLIGHTED_PILL_CLASS : IDLE_PILL_CLASS, className)}
			>
				<Body text={pillText} isPlaying={isPlaying} />
			</Button>
		</Tooltip>
	)
}

/**
 * Composes the loaded player's explicit playing or paused toggle.
 */
export function PodcastEpisodePlaybackPill({ elements: { Button } }: { elements: PodcastEpisodePillElements }) {
	const { isPlaying } = usePodcastEpisodePlayer()
	return (
		<Button
			label={isPlaying ? "Playing. Pause" : "Paused. Play"}
			onPress={togglePlayback}
			isHighlighted
			className={cn(PILL_CLASS, HIGHLIGHTED_PILL_CLASS, "hover:bg-primary/90")}
		>
			{isPlaying ? "Playing" : "Paused"}
		</Button>
	)
}

/**
 * Reports whether a Finding's chapter is currently playing.
 */
export function useIsFindingChapterPlaying(
	podcastEpisode: PodcastEpisode | null | undefined,
	findingId: string,
): boolean {
	const chapter = usePlayerChapter()
	return useIsPodcastEpisodePlaying(podcastEpisode?.id) && chapter?.findingId === findingId
}

/**
 * Selects a Finding's narrated chapter and renders its shared pill.
 */
export function FindingChapterPill({
	podcastEpisode,
	findingId,
	className,
	elements,
}: FindingChapterPillProps & { elements: PodcastEpisodePillElements }) {
	const chapter = podcastEpisode?.chapters.find((chapter) => chapter.findingId === findingId)
	return podcastEpisode && chapter ? (
		<PodcastEpisodeChapterPill
			podcastEpisode={podcastEpisode}
			chapter={chapter}
			className={className}
			elements={elements}
		/>
	) : null
}
