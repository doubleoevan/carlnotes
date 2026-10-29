import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { type ComponentType, type ReactNode, useState } from "react"
import { toClockLabel } from "../lib/labels"
import { playPodcastEpisode, seekPlaybackTo } from "../stores/podcastEpisodePlayerStore"

export type PodcastEpisodeSeekBarProps = {
	podcastEpisode: PodcastEpisode
	positionSeconds: number
	isPodcastEpisodeLoaded: boolean
}
export type PodcastEpisodeSeekBarElements = {
	Group: ComponentType<{ children: ReactNode; className?: string }>
	Text: ComponentType<{ children: ReactNode; className?: string }>
	Track: ComponentType<{
		children: ReactNode
		positionSeconds: number
		durationSeconds: number
		onSeek: (seconds: number) => void
		onPreviewSeek: (seconds: number) => void
	}>
	Segment: ComponentType<{ weight: number; percent: number }>
}

/**
 * Composes weighted chapter segments and shared seek behavior with a platform range control.
 */
export function PodcastEpisodeSeekBar({
	podcastEpisode,
	positionSeconds,
	isPodcastEpisodeLoaded,
	elements: { Group, Text, Track, Segment },
}: PodcastEpisodeSeekBarProps & { elements: PodcastEpisodeSeekBarElements }) {
	// preview a drag without seeking audio until release
	const durationSeconds = podcastEpisode.durationSeconds ?? 0
	const [previewPositionSeconds, setPreviewPositionSeconds] = useState<number | null>(null)
	const shownPositionSeconds = previewPositionSeconds ?? positionSeconds
	const handleSeek = (seconds: number): void => {
		setPreviewPositionSeconds(null)
		if (isPodcastEpisodeLoaded) {
			seekPlaybackTo(seconds)
		} else {
			void playPodcastEpisode(podcastEpisode, seconds)
		}
	}
	return (
		<Group className="flex flex-row items-center gap-3">
			<Text className="hidden text-xs tabular-nums text-muted-foreground sm:block">
				{toClockLabel(shownPositionSeconds)}
			</Text>
			<Track
				positionSeconds={Math.min(shownPositionSeconds, durationSeconds)}
				durationSeconds={durationSeconds}
				onSeek={handleSeek}
				onPreviewSeek={setPreviewPositionSeconds}
			>
				{/* chapter segments */}
				{podcastEpisode.chapters.map((chapter) => {
					// size each segment by chapter duration and fill it through the current position
					const weight = Math.max(1, chapter.endSeconds - chapter.startSeconds)
					const percent = Math.min(100, Math.max(0, ((shownPositionSeconds - chapter.startSeconds) / weight) * 100))
					return <Segment key={chapter.position} weight={weight} percent={percent} />
				})}
			</Track>
			<Text className="hidden text-xs tabular-nums text-muted-foreground sm:block">
				{toClockLabel(durationSeconds)}
			</Text>
		</Group>
	)
}
