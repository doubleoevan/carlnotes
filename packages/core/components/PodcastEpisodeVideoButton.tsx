// the button that opens a podcast episode's film: a film card's play button over the card's image, a row's Video pill,
// or the play button over the film's poster in a topic's info, and the Video dialog its press opens. a film card's
// press plays the film
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { TOPIC_PODCAST_EPISODE_VIDEO_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { FilmVisitEvents, TopicPodcastEpisodeVideoDialogSurface } from "@carlnotes/contracts/visitAnalytics"
import { type ComponentType, useState } from "react"

// the button's sizes: a film card's play button centered over the card's image, a pill beside a row's play pill, or a
// play button over the film's poster
type PodcastEpisodeVideoButtonSize = "card" | "pill" | "thumbnail"

// each app's button, which draws the Video dialog beside it while the dialog is open
export type PodcastEpisodeVideoButtonElements = {
	Button: ComponentType<{
		label: string
		size: PodcastEpisodeVideoButtonSize
		// the film's poster under a thumbnail's play button, null with none
		posterUrl: string | null
		// the podcast episode whose film the dialog plays, the dialog's title, and whether the dialog plays the film
		// once it loads
		podcastEpisode: PodcastEpisodeSummary
		dialogTitle: string
		shouldPlayOnLoad: boolean
		isDialogOpen: boolean
		onPress: () => void
		onDialogClose: () => void
	}>
}

// the podcast episode, the button's label and size, and the section that its press reports
export type PodcastEpisodeVideoButtonProps = {
	podcastEpisode: PodcastEpisodeSummary
	label: "Video" | "Play film"
	surface: TopicPodcastEpisodeVideoDialogSurface
	size?: PodcastEpisodeVideoButtonSize
	// the film's poster, which only the thumbnail size draws
	posterUrl?: string | null
}

/**
 * Composes the button that opens a film. A press opens the Video dialog and reports the podcast episode's id and the
 * section the button sits in. A film card's play button is a play press, so its dialog plays the film once it loads.
 */
export function PodcastEpisodeVideoButton({
	podcastEpisode,
	label,
	surface,
	size = "card",
	posterUrl = null,
	onOpened,
	elements: { Button },
}: PodcastEpisodeVideoButtonProps & {
	onOpened: (properties: FilmVisitEvents["visit_episode_video_dialog_opened"]) => void
	elements: PodcastEpisodeVideoButtonElements
}) {
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	return (
		<Button
			label={label}
			size={size}
			posterUrl={posterUrl}
			podcastEpisode={podcastEpisode}
			dialogTitle={podcastEpisode.title ?? TOPIC_PODCAST_EPISODE_VIDEO_NAME}
			shouldPlayOnLoad={size === "card"}
			isDialogOpen={isDialogOpen}
			onPress={() => {
				setIsDialogOpen(true)
				onOpened({ podcastEpisodeId: podcastEpisode.id, surface })
			}}
			onDialogClose={() => setIsDialogOpen(false)}
		/>
	)
}
