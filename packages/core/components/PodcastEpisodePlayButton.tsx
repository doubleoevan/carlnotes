import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { ComponentType, ReactNode } from "react"
import { togglePodcastEpisodePlayback } from "../stores/podcastEpisodePlayActions"
import { useIsPodcastEpisodePlaying } from "../stores/podcastEpisodePlayerStore"

export type PodcastEpisodePlayButtonElements = {
	Button: ComponentType<{
		children: ReactNode
		label: string
		onPress: () => void
		onHover?: () => void
		className?: string
		size: "sm" | "default" | "lg"
	}>
	Icon: ComponentType<{ isPlaying: boolean; size: "sm" | "default" | "lg" }>
	Tooltip: ComponentType<{ podcastEpisode: PodcastEpisodeSummary; children: ReactNode }>
}

/**
 * Composes the episode play/pause action, label, icon, and optional platform tooltip.
 */
export function PodcastEpisodePlayButton({
	podcastEpisode,
	elements: { Button, Icon, Tooltip },
	size = "sm",
	className,
	onHover,
	onPress,
}: {
	podcastEpisode: PodcastEpisodeSummary
	elements: PodcastEpisodePlayButtonElements
	size?: "sm" | "default" | "lg"
	className?: string
	onHover?: () => void
	onPress?: () => void
}) {
	const isPlaying = useIsPodcastEpisodePlaying(podcastEpisode.id)
	return (
		<Tooltip podcastEpisode={podcastEpisode}>
			<Button
				label={`${isPlaying ? "Pause" : "Play"} episode ${podcastEpisode.episodeNumber}`}
				onPress={onPress ?? (() => void togglePodcastEpisodePlayback(podcastEpisode.id))}
				onHover={onHover}
				className={className}
				size={size}
			>
				<Icon isPlaying={isPlaying} size={size} />
			</Button>
		</Tooltip>
	)
}
