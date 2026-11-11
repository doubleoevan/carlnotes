import type { PodcastEpisodeFormat, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { ComponentType, ReactNode } from "react"
import { toPodcastEpisodeDayAndDurationLabels, toPodcastEpisodeTitleLabel } from "../lib/labels"
import { togglePodcastEpisodePlayback } from "../stores/podcastEpisodePlayActions"
import { useIsPodcastEpisodePlaying } from "../stores/podcastEpisodePlayerStore"

export type PodcastEpisodeRowProps = {
	podcastEpisode: PodcastEpisodeSummary
	podcastEpisodePath: string | null
	isLatestPodcastEpisode: boolean
	isPlayButtonMuted?: boolean
	className?: string
	onRemovePodcastEpisode?: () => void
	// a Coffee Break films row plays the film through its own press
	filmPlay?: { onPress: () => void }
	// the row's own play control, drawn in place of the play button
	playButton?: ReactNode
}
export type PodcastEpisodeRowElements = {
	Row: ComponentType<{ children: ReactNode; className?: string }>
	Group: ComponentType<{ children: ReactNode }>
	Play: ComponentType<{
		podcastEpisode: PodcastEpisodeSummary
		isPlaying: boolean
		isMuted: boolean
		onPress: () => void
		label: string
	}>
	Title: ComponentType<{ podcastEpisode: PodcastEpisodeSummary; path: string | null; children: ReactNode }>
	Metadata: ComponentType<{ children: ReactNode }>
	Remove: ComponentType<{ episodeNumber: number | null; onRemovePodcastEpisode: () => void }>
}

/**
 * Composes the episode row's distinct play, title, metadata, and permitted removal controls.
 */
export function PodcastEpisodeRow({
	podcastEpisode,
	podcastEpisodePath,
	isLatestPodcastEpisode,
	isPlayButtonMuted = false,
	className,
	onRemovePodcastEpisode,
	filmPlay,
	playButton,
	elements: { Row, Group, Play, Title, Metadata, Remove },
}: PodcastEpisodeRowProps & { elements: PodcastEpisodeRowElements }) {
	// combine playback state in the row's format with the row metadata
	const format: PodcastEpisodeFormat | undefined = filmPlay ? "video" : undefined
	const isPlaying = useIsPodcastEpisodePlaying(podcastEpisode.id, format)
	const details = [
		...toPodcastEpisodeDayAndDurationLabels(podcastEpisode),
		...(isLatestPodcastEpisode ? ["latest"] : []),
	]
	return (
		<Row className={className}>
			{playButton ?? (
				<Play
					podcastEpisode={podcastEpisode}
					isPlaying={isPlaying}
					isMuted={isPlayButtonMuted}
					onPress={filmPlay?.onPress ?? (() => void togglePodcastEpisodePlayback(podcastEpisode.id))}
					label={`${isPlaying ? "Pause" : "Play"} ${filmPlay ? "film" : "episode"} ${podcastEpisode.episodeNumber}`}
				/>
			)}
			<Group>
				<Title podcastEpisode={podcastEpisode} path={podcastEpisodePath}>
					{toPodcastEpisodeTitleLabel(podcastEpisode)}
				</Title>
				<Metadata>{details.join(" · ")}</Metadata>
			</Group>
			{onRemovePodcastEpisode && (
				<Remove episodeNumber={podcastEpisode.episodeNumber} onRemovePodcastEpisode={onRemovePodcastEpisode} />
			)}
		</Row>
	)
}
