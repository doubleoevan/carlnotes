// the web's button that opens a podcast episode's film: a film card's play button over the card's image, a row's Video
// pill, or the play button over the film's poster, and the Video dialog its press opens
import { IDLE_PODCAST_EPISODE_PILL_CLASS } from "@carlnotes/core/components/PodcastEpisodePill"
import {
	type PodcastEpisodeVideoButtonElements,
	type PodcastEpisodeVideoButtonProps,
	PodcastEpisodeVideoButton as SharedPodcastEpisodeVideoButton,
} from "@carlnotes/core/components/PodcastEpisodeVideoButton"
import { cn } from "@carlnotes/nightshift/classNames"
import { Clapperboard, Play } from "lucide-react"
import type { ComponentProps } from "react"
import { PLAY_BUTTON_CLASS } from "@/lib/styleClasses"
import { captureFilmVisitEvent } from "@/lib/visitAnalytics"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { TopicPodcastEpisodeVideoDialog } from "./TopicPodcastEpisodeVideoDialog"

const ELEMENTS: PodcastEpisodeVideoButtonElements = { Button: VideoButton }

// a film card's play button takes the press inside its frame, and its focus ring is set off from the image
const TOPIC_PODCAST_EPISODE_VIDEO_CARD_PLAY_BUTTON_CLASS = cn(
	"pointer-events-auto cursor-pointer rounded-full outline-none",
	"focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
)

/**
 * Renders the shared button that opens a film with the browser's button and Video dialog, and reports its press.
 */
export function PodcastEpisodeVideoButton(props: PodcastEpisodeVideoButtonProps) {
	return (
		<SharedPodcastEpisodeVideoButton
			{...props}
			onOpened={(properties) => captureFilmVisitEvent("visit_episode_video_dialog_opened", properties)}
			elements={ELEMENTS}
		/>
	)
}

// the browser's button, with the Video dialog while it is open
function VideoButton({
	label,
	size,
	posterUrl,
	podcastEpisode,
	dialogTitle,
	shouldPlayOnLoad,
	isDialogOpen,
	onPress,
	onDialogClose,
}: ComponentProps<PodcastEpisodeVideoButtonElements["Button"]>) {
	const dialog = isDialogOpen && (
		<TopicPodcastEpisodeVideoDialog
			podcastEpisodeId={podcastEpisode.id}
			title={dialogTitle}
			shouldPlayOnLoad={shouldPlayOnLoad}
			onClose={onDialogClose}
		/>
	)

	// a row's pill, drawn as the play pill beside it
	if (size === "pill") {
		return (
			<>
				<button type="button" onClick={onPress} className={IDLE_PODCAST_EPISODE_PILL_CLASS}>
					<Clapperboard className="size-3" strokeWidth={2.5} />
					{label}
				</button>
				{dialog}
			</>
		)
	}

	// the film's poster at 16:9 under the film player's round play button. the whole poster takes the press
	if (size === "thumbnail") {
		return (
			<>
				<button
					type="button"
					aria-label={label}
					onClick={onPress}
					className="group relative grid aspect-video w-30 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xs bg-hero"
				>
					{posterUrl && <img src={posterUrl} alt="" className="absolute inset-0 size-full object-contain" />}
					<span className={cn(PLAY_BUTTON_CLASS, "relative size-9 group-hover:bg-primary/90")}>
						<Play className="size-4 fill-current" />
					</span>
				</button>
				{dialog}
			</>
		)
	}

	// a film card's play button, the play button at the film player's size, centered in the 3:2 frame of the card's
	// image and above the card's stretched link. only the button takes the press, so the image around it opens the
	// page. it shows play at all times
	return (
		<>
			<div className="pointer-events-none absolute inset-x-0 top-0 grid aspect-[3/2] place-items-center">
				<PodcastEpisodePlayButton
					podcastEpisode={podcastEpisode}
					size="lg"
					label={label}
					isPlaying={false}
					onPress={onPress}
					className={TOPIC_PODCAST_EPISODE_VIDEO_CARD_PLAY_BUTTON_CLASS}
				/>
			</div>
			{dialog}
		</>
	)
}
