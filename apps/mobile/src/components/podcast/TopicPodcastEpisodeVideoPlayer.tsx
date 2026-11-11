import { toApiUrl } from "@carlnotes/client/apiClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodePlayButtonElements,
	PodcastEpisodePlayButton as SharedPodcastEpisodePlayButton,
} from "@carlnotes/core/components/PodcastEpisodePlayButton"
import {
	TopicPodcastEpisodeVideoPlayer as SharedTopicPodcastEpisodeVideoPlayer,
	type TopicPodcastEpisodeVideoControl,
	type TopicPodcastEpisodeVideoPlayerElements,
	type TopicPodcastEpisodeVideoPlayerProps,
	type TopicPodcastEpisodeVideoSurfaceControls,
} from "@carlnotes/core/components/TopicPodcastEpisodeVideoPlayer"
import {
	registerTopicPodcastEpisodeVideoAdapter,
	reportPodcastEpisodeAudioEvent,
	usePodcastEpisodePlayer,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { Image } from "expo-image"
import { isPictureInPictureSupported, useVideoPlayer, VideoView } from "expo-video"
import { Captions, CaptionsOff, Maximize, PictureInPicture2, Play, Volume2, VolumeX } from "lucide-react-native"
import { useEffect, useRef, useState } from "react"
import { Pressable, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTopicPodcastEpisodeVideoAdapter } from "@/topicPodcastEpisodeVideoAdapter"
import {
	MOBILE_PLAYBACK_CONTROL_BUTTON_CLASS,
	PlaybackSpeedButton,
	SkipPlaybackButtons,
} from "./PlaybackControlButtons"
import { PodcastEpisodeSeekBar } from "./PodcastEpisodeSeekBar"

// each control's icon
const CONTROL_ICONS: Record<TopicPodcastEpisodeVideoControl, typeof Captions> = {
	captions: Captions,
	mute: Volume2,
	pictureInPicture: PictureInPicture2,
	fullscreen: Maximize,
}

// the play button over the film's frame. the whole frame takes the press, and the round button hides while the film
// plays
const playButtonElements: PodcastEpisodePlayButtonElements = {
	Button: ({ children, label, onPress }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			className="absolute inset-0 items-center justify-center active:opacity-75"
		>
			{children}
		</Pressable>
	),
	Icon: ({ isPlaying }) =>
		isPlaying ? null : (
			<View className="size-14 items-center justify-center rounded-full bg-primary shadow-raised">
				<Icon as={Play} className="size-7 text-primary-foreground" fill="currentColor" />
			</View>
		),
	Tooltip: ({ children }) => children,
}

const elements: TopicPodcastEpisodeVideoPlayerElements = {
	Group: ({ children, className }) => <View className={className}>{children}</View>,
	Card: ({ children }) => (
		<View className="gap-3 rounded-lg border border-separator bg-card p-5 shadow-raised">{children}</View>
	),
	Surface: TopicPodcastEpisodeVideoSurface,
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
		return (
			<Button
				variant="ghost"
				size="icon"
				className={MOBILE_PLAYBACK_CONTROL_BUTTON_CLASS}
				accessibilityLabel={label}
				accessibilityState={isPressed === undefined ? undefined : { selected: isPressed }}
				onPress={onPress}
			>
				<Icon as={pressedStateIcon ?? CONTROL_ICONS[control]} className="size-4.5 text-muted-foreground" />
			</Button>
		)
	},
	Feedback: ({ isLoading, errorMessage }) =>
		errorMessage ? (
			<Text accessibilityRole="alert" className="text-sm text-destructive">
				{errorMessage}
			</Text>
		) : isLoading ? (
			<Text accessibilityLiveRegion="polite" className="text-xs text-muted-foreground">
				Loading film…
			</Text>
		) : null,
}

/**
 * Adapts the shared film player to an Expo film view, its built-in captions track, fullscreen, and
 * picture-in-picture.
 */
export function TopicPodcastEpisodeVideoPlayer(props: TopicPodcastEpisodeVideoPlayerProps) {
	return <SharedTopicPodcastEpisodeVideoPlayer {...props} elements={elements} />
}

// the Expo film view: the poster until the film's first frame, the captions track, the film's sound, and native
// controls only in fullscreen
function TopicPodcastEpisodeVideoSurface({
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
	onSurfaceControls: (surfaceControls: TopicPodcastEpisodeVideoSurfaceControls) => void
}) {
	// one Expo film player for this frame, playing on with the phone locked and showing on the lock screen
	const player = useVideoPlayer(null, (videoPlayer) => {
		videoPlayer.staysActiveInBackground = true
		videoPlayer.showNowPlayingNotification = true
		videoPlayer.timeUpdateEventInterval = 0.5
	})

	// drive the player from the shared player while mounted, and report the controls this phone supports
	const videoViewRef = useRef<VideoView>(null)
	useEffect(() => {
		onSurfaceControls({
			enterFullscreen: () => void videoViewRef.current?.enterFullscreen(),
			enterPictureInPicture: isPictureInPictureSupported()
				? () => void videoViewRef.current?.startPictureInPicture()
				: null,
		})
		return registerTopicPodcastEpisodeVideoAdapter(
			toTopicPodcastEpisodeVideoAdapter({ player, onEvent: reportPodcastEpisodeAudioEvent }),
		)
	}, [player, onSurfaceControls])

	// turn the film's sound off or on
	useEffect(() => {
		player.muted = isMuted
	}, [player, isMuted])

	// show or hide the film's built-in captions now, and again once a newly loaded film lists its tracks
	useEffect(() => {
		const applyCaptions = (): void => {
			player.subtitleTrack = isCaptionsShown ? (player.availableSubtitleTracks[0] ?? null) : null
		}
		applyCaptions()
		const subscription = player.addListener("availableSubtitleTracksChange", applyCaptions)
		return () => subscription.remove()
	}, [player, isCaptionsShown])

	// show the poster until this film draws its first frame, and again once it unloads
	const sharedPlayer = usePodcastEpisodePlayer()
	const isFilmLoaded = sharedPlayer.podcastEpisode?.id === podcastEpisode.id && sharedPlayer.format === "video"
	const [hasFirstFrame, setHasFirstFrame] = useState(false)
	useEffect(() => {
		if (!isFilmLoaded) {
			setHasFirstFrame(false)
		}
	}, [isFilmLoaded])

	// native controls show only while the film fills the screen
	const [isFullscreen, setIsFullscreen] = useState(false)
	return (
		<View className="aspect-video w-full overflow-hidden rounded-lg bg-hero">
			<VideoView
				ref={videoViewRef}
				player={player}
				nativeControls={isFullscreen}
				contentFit="contain"
				allowsPictureInPicture
				onFirstFrameRender={() => setHasFirstFrame(true)}
				onFullscreenEnter={() => setIsFullscreen(true)}
				onFullscreenExit={() => setIsFullscreen(false)}
				accessibilityLabel={podcastEpisode.title ? `Film of ${podcastEpisode.title}` : "Film"}
				style={{ width: "100%", height: "100%" }}
			/>
			{/* the poster over the view until the film's first frame. its url is an api path */}
			{posterUrl && !(isFilmLoaded && hasFirstFrame) && (
				<Image
					source={{ uri: toApiUrl(posterUrl) }}
					contentFit="contain"
					accessible={false}
					style={{ position: "absolute", width: "100%", height: "100%" }}
				/>
			)}
		</View>
	)
}
