import type { PodcastEpisode, PodcastEpisodeChapter, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import {
	type FindingChapterPillProps,
	type PodcastEpisodePillElements,
	PodcastEpisodeChapterPill as SharedChapterPill,
	FindingChapterPill as SharedFindingChapterPill,
	PodcastEpisodeNumberPill as SharedNumberPill,
	PodcastEpisodePlaybackPill as SharedPlaybackPill,
} from "@carlnotes/core/components/PodcastEpisodePill"

export { useIsFindingChapterPlaying } from "@carlnotes/core/components/PodcastEpisodePill"

import { Headphones, Pause, Play } from "lucide-react"
import { PodcastEpisodeTooltip } from "./PodcastEpisodeDetails"

const elements: PodcastEpisodePillElements = {
	Button: ({ children, label, onPress, className }) => (
		<button
			type="button"
			aria-label={label}
			className={className}
			onClick={(event) => {
				event.stopPropagation()
				onPress()
			}}
		>
			{children}
		</button>
	),
	Body: ({ text, isPlaying }) => (
		<>
			<Headphones className="size-3" strokeWidth={2.5} />
			{text}
			{isPlaying ? (
				<Pause className="size-2.5 fill-current" strokeWidth={2.5} />
			) : (
				<Play className="size-2.5 fill-current" strokeWidth={2.5} />
			)}
		</>
	),
	Tooltip: PodcastEpisodeTooltip,
}

/**
 * Adapts the shared chapter pill to the app's standard controls.
 */
export function PodcastEpisodeChapterPill(props: {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
	className?: string
}) {
	return <SharedChapterPill {...props} elements={elements} />
}

/**
 * Selects a Finding's narrated chapter and renders its shared pill.
 */
export function FindingChapterPill(props: FindingChapterPillProps) {
	return <SharedFindingChapterPill {...props} elements={elements} />
}

/**
 * Adapts the shared episode-number playback pill.
 */
export function PodcastEpisodeNumberPill({
	podcastEpisode,
	className,
}: {
	podcastEpisode: PodcastEpisodeSummary | null
	className?: string
}) {
	return podcastEpisode ? (
		<SharedNumberPill podcastEpisode={podcastEpisode} className={className} elements={elements} />
	) : null
}

/**
 * Adapts the shared playing or paused toggle.
 */
export function PodcastEpisodePlaybackPill() {
	return <SharedPlaybackPill elements={elements} />
}
