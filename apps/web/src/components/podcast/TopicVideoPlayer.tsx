import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodePlayButtonElements,
	PodcastEpisodePlayButton as SharedPodcastEpisodePlayButton,
} from "@carlnotes/core/components/PodcastEpisodePlayButton"
import {
	TopicVideoPlayer as SharedTopicVideoPlayer,
	type TopicVideoControl,
	type TopicVideoPlayerElements,
	type TopicVideoPlayerProps,
	type TopicVideoSurfaceControls,
} from "@carlnotes/core/components/TopicVideoPlayer"
import { playTopicVideo, toPodcastEpisodePlayerState } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { Captions, CaptionsOff, Maximize, Pause, PictureInPicture2, Play, Volume2, VolumeX } from "lucide-react"
import { useEffect, useLayoutEffect, useRef } from "react"
import { IconButton } from "@/components/common/IconButton"
import { FILM_CARD_CLASS, PLAY_BUTTON_CLASS, PLAYBACK_CONTROL_BUTTON_CLASS } from "@/lib/styleClasses"
import { usePodcastEpisodePlayer } from "@/stores/podcastEpisodePlayerStore"
import {
	enterTopicVideoFullscreen,
	enterTopicVideoPictureInPicture,
	hideTopicVideoElement,
	muteTopicVideo,
	showTopicVideoCaptions,
	showTopicVideoElement,
	toTopicVideoSupport,
} from "@/stores/topicVideoElement"
import { PlaybackSpeedButton, SkipPlaybackButtons } from "./PlaybackControlButtons"
import { PodcastEpisodeSeekBar } from "./PodcastEpisodeSeekBar"

// each control's icon
const CONTROL_ICONS: Record<TopicVideoControl, typeof Captions> = {
	captions: Captions,
	mute: Volume2,
	pictureInPicture: PictureInPicture2,
	fullscreen: Maximize,
}

// the play button over the film's frame. the whole frame takes the press, and the round button hides while the film
// plays, except under keyboard focus
const playButtonElements: PodcastEpisodePlayButtonElements = {
	Button: ({ children, label, onPress }) => (
		<button
			type="button"
			aria-label={label}
			onClick={onPress}
			className="group absolute inset-0 grid cursor-pointer place-items-center rounded-lg"
		>
			{children}
		</button>
	),
	Icon: ({ isPlaying }) => {
		const PlaybackIcon = isPlaying ? Pause : Play
		return (
			<span
				className={cn(
					PLAY_BUTTON_CLASS,
					"size-14 transition-opacity group-hover:bg-primary/90 sm:size-16",
					isPlaying && "opacity-0 group-focus-visible:opacity-100",
				)}
			>
				<PlaybackIcon className="size-7 fill-current" />
			</span>
		)
	},
	Tooltip: ({ children }) => children,
}

// the browser's film player elements
export const TOPIC_VIDEO_PLAYER_ELEMENTS: TopicVideoPlayerElements = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Card: ({ children }) => <div className={FILM_CARD_CLASS}>{children}</div>,
	Title: ({ children, className }) => <h4 className={className}>{children}</h4>,
	Text: ({ children, className }) => <p className={className}>{children}</p>,
	Surface: TopicVideoSurface,
	PlayButton: ({ podcastEpisode, isPlaying, onPress }) => (
		<SharedPodcastEpisodePlayButton
			podcastEpisode={podcastEpisode}
			size="lg"
			isPlaying={isPlaying}
			onPress={onPress}
			elements={playButtonElements}
		/>
	),
	Controls: ({ playbackRate, onSkip, onSpeedPress }) => (
		<>
			<SkipPlaybackButtons onSkip={onSkip} />
			<PlaybackSpeedButton playbackRate={playbackRate} onPress={onSpeedPress} />
		</>
	),
	SeekBar: PodcastEpisodeSeekBar,
	ControlButton: ({ control, label, isPressed, onPress }) => {
		// hidden captions show the struck-through icon, and a muted film the crossed speaker
		const isCaptionsHidden = control === "captions" && !isPressed
		const isMuted = control === "mute" && isPressed
		const pressedStateIcon = isCaptionsHidden ? CaptionsOff : isMuted ? VolumeX : null
		const ControlIcon = pressedStateIcon ?? CONTROL_ICONS[control]
		return (
			<IconButton tooltip={label} isPressed={isPressed} onClick={onPress} className={PLAYBACK_CONTROL_BUTTON_CLASS}>
				<ControlIcon className="size-4.5" />
			</IconButton>
		)
	},
	Feedback: ({ isLoading, errorMessage }) =>
		errorMessage ? (
			<p role="alert" className="text-sm text-destructive">
				{errorMessage}
			</p>
		) : isLoading ? (
			<p role="status" className="text-xs text-muted-foreground">
				Loading film…
			</p>
		) : null,
}

/**
 * Adapts the shared film player to the browser's film element, its captions track, fullscreen, and
 * picture-in-picture.
 */
export function TopicVideoPlayer(props: TopicVideoPlayerProps) {
	return <SharedTopicVideoPlayer {...props} elements={TOPIC_VIDEO_PLAYER_ELEMENTS} />
}

// the film's frame: the poster, with the browser's one film element over it while this podcast episode's film is
// loaded
function TopicVideoSurface({
	podcastEpisode,
	posterUrl,
	isCaptionsShown,
	isMuted,
	onSurfaceControls,
}: {
	podcastEpisode: PodcastEpisode
	posterUrl: string | null
	isCaptionsShown: boolean
	isMuted: boolean
	onSurfaceControls: (surfaceControls: TopicVideoSurfaceControls) => void
}) {
	// show the film element in this frame while this podcast episode's film is loaded. a film in picture-in-picture
	// plays on once the frame goes away, and any other pauses there. the layout effect's cleanup moves the element
	// to its host before React takes the frame out of the document, so the element never leaves the document
	const frameRef = useRef<HTMLDivElement>(null)
	const player = usePodcastEpisodePlayer()
	const isFilmLoaded = player.podcastEpisode?.id === podcastEpisode.id && player.format === "video"
	useLayoutEffect(() => {
		const frameElement = frameRef.current
		if (!isFilmLoaded || !frameElement) {
			return
		}
		showTopicVideoElement(frameElement)
		return () => hideTopicVideoElement(frameElement, podcastEpisode.id)
	}, [isFilmLoaded, podcastEpisode.id])

	// apply the session's captions and sound choices to the film element
	useEffect(() => {
		showTopicVideoCaptions(isCaptionsShown)
		muteTopicVideo(isMuted)
	}, [isCaptionsShown, isMuted])

	// report the controls this browser supports. each starts this film if it is not the one loaded, and shows the
	// film element in this frame before it acts
	useEffect(() => {
		const showFilm = (): void => {
			const { podcastEpisode: loadedPodcastEpisode, format } = toPodcastEpisodePlayerState()
			if (loadedPodcastEpisode?.id !== podcastEpisode.id || format !== "video") {
				void playTopicVideo(podcastEpisode)
			}
			if (frameRef.current) {
				showTopicVideoElement(frameRef.current)
			}
		}
		const enterFullscreen = (): void => {
			showFilm()
			enterTopicVideoFullscreen()
		}
		const enterPictureInPicture = (): void => {
			showFilm()
			enterTopicVideoPictureInPicture()
		}

		// leave out a control this browser lacks
		const { hasFullscreen, hasPictureInPicture } = toTopicVideoSupport()
		onSurfaceControls({
			enterFullscreen: hasFullscreen ? enterFullscreen : null,
			enterPictureInPicture: hasPictureInPicture ? enterPictureInPicture : null,
		})
	}, [podcastEpisode, onSurfaceControls])
	return (
		<div ref={frameRef} className="relative aspect-video w-full overflow-hidden rounded-lg bg-hero">
			{/* the poster, which the film element covers once its film draws */}
			{posterUrl && <img src={posterUrl} alt="" className="absolute inset-0 size-full object-contain" />}
		</div>
	)
}
