// the film player that the topic video section, the podcast episode page, and the Video dialog show: the film's frame
// with the play button over it, the seek bar split by chapter, the playback controls, and the captions, mute,
// picture-in-picture, and fullscreen controls. a page shows it in a card, and the Video dialog in its own frame
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import { type ComponentType, type ReactNode, useState } from "react"
import { toPodcastEpisodeDayDurationAndChapterLabels } from "../lib/labels"
import { toPodcastEpisodePosterUrl } from "../lib/podcastEpisodePlayback"
import {
	cycleTopicVideoPlaybackRate,
	playTopicVideo,
	skipTopicVideoBy,
	togglePlayback,
	usePlayerPositionSeconds,
	usePodcastEpisodePlayer,
} from "../stores/podcastEpisodePlayerStore"
import type { PodcastEpisodeSeekBarProps } from "./PodcastEpisodeSeekBar"

// what the film's frame can do on its platform. a null control is hidden
export type TopicVideoSurfaceControls = {
	enterFullscreen: (() => void) | null
	enterPictureInPicture: (() => void) | null
}

// the film player's own controls beside play and the skips
export type TopicVideoControl = "captions" | "mute" | "pictureInPicture" | "fullscreen"

// the player layout uses each app's film element and its existing controls
export type TopicVideoPlayerElements = {
	Group: ComponentType<{ children: ReactNode; className?: string }>
	// the page's card around the film player, a column with the player's own gap
	Card: ComponentType<{ children: ReactNode }>
	Title: ComponentType<{ children: string; className: string }>
	// the card's small details line
	Text: ComponentType<{ children: string; className: string }>
	// the film's frame. it shows the poster until this podcast episode's film draws, and reports the controls its
	// platform supports
	Surface: ComponentType<{
		podcastEpisode: PodcastEpisode
		posterUrl: string | null
		isCaptionsShown: boolean
		isMuted: boolean
		onSurfaceControls: (surfaceControls: TopicVideoSurfaceControls) => void
	}>
	// the play button over the frame. it fills the frame, and its round button hides while the film plays
	PlayButton: ComponentType<{ podcastEpisode: PodcastEpisode; isPlaying: boolean; onPress: () => void }>
	// the skips and the speed, which show before the film is loaded
	Controls: ComponentType<{ playbackRate: number; onSkip: (skipSeconds: number) => void; onSpeedPress: () => void }>
	SeekBar: ComponentType<PodcastEpisodeSeekBarProps>
	ControlButton: ComponentType<{
		control: TopicVideoControl
		label: string
		isPressed?: boolean
		onPress: () => void
	}>
	Feedback: ComponentType<{ isLoading: boolean; errorMessage: string | null }>
}

// whether captions show and whether the film's sound is off. each choice lasts for the session, across every film
let isCaptionsShownForSession = true
let isMutedForSession = false

// the platform controls before the frame reports its own
const NO_SURFACE_CONTROLS: TopicVideoSurfaceControls = {
	enterFullscreen: null,
	enterPictureInPicture: null,
}

// the podcast episode with a film, whether a card holds the player, and what the card shows under the controls
export type TopicVideoPlayerProps = {
	podcastEpisode: PodcastEpisode
	isCard?: boolean
	cardFooter?: ReactNode
}

/**
 * Composes the film player for a podcast episode with a film, on its poster until a press plays it.
 */
export function TopicVideoPlayer({
	podcastEpisode,
	isCard = false,
	cardFooter,
	elements: { Group, Card, Title, Text, Surface, PlayButton, Controls, SeekBar, ControlButton, Feedback },
}: TopicVideoPlayerProps & { elements: TopicVideoPlayerElements }) {
	// whether this podcast episode is loaded, whether it is loaded as the film, and the controls the frame supports
	const player = usePodcastEpisodePlayer()
	const isLoaded = player.podcastEpisode?.id === podcastEpisode.id
	const isFilmLoaded = isLoaded && player.format === "video"
	const [surfaceControls, setSurfaceControls] = useState(NO_SURFACE_CONTROLS)
	const [isCaptionsShown, setIsCaptionsShown] = useState(isCaptionsShownForSession)
	const [isMuted, setIsMuted] = useState(isMutedForSession)

	// show or hide the captions for this film and every film after it in the session
	const toggleCaptions = (): void => {
		isCaptionsShownForSession = !isCaptionsShown
		setIsCaptionsShown(isCaptionsShownForSession)
	}

	// turn the film's sound off or on for this film and every film after it in the session
	const toggleMuted = (): void => {
		isMutedForSession = !isMuted
		setIsMuted(isMutedForSession)
	}

	// the film's frame, the seek bar, the control row, and what the page shows under them
	const topicVideoPlayer = (
		<>
			{/* the film's frame. a press plays the film, and a press on a playing film pauses it */}
			<Group className="relative">
				<Surface
					podcastEpisode={podcastEpisode}
					posterUrl={toPodcastEpisodePosterUrl(podcastEpisode)}
					isCaptionsShown={isCaptionsShown}
					isMuted={isMuted}
					onSurfaceControls={setSurfaceControls}
				/>
				<PlayButton
					podcastEpisode={podcastEpisode}
					isPlaying={isFilmLoaded && player.isPlaying}
					onPress={() => {
						if (isFilmLoaded) {
							togglePlayback()
						} else {
							void playTopicVideo(podcastEpisode)
						}
					}}
				/>
			</Group>
			{/* playback feedback, and the one position the film and the audio share */}
			{isFilmLoaded && <Feedback isLoading={player.isLoading} errorMessage={player.errorMessage} />}
			{isLoaded ? (
				<LoadedFilmSeekBar podcastEpisode={podcastEpisode} SeekBar={SeekBar} />
			) : (
				<SeekBar
					podcastEpisode={podcastEpisode}
					positionSeconds={podcastEpisode.progressSeconds}
					isPodcastEpisodeLoaded={false}
					format="video"
				/>
			)}
			{/* the skips and speed, where a press starts a film that is not loaded, and the film's own controls. the two
			    groups sit at the row's ends, and on a narrow screen the film's own controls wrap under the others at the left */}
			<Group className="flex flex-row flex-wrap items-center justify-between gap-1.5">
				<Group className="flex flex-row items-center gap-1.5">
					<Controls
						playbackRate={player.playbackRate}
						onSkip={(skipSeconds) => skipTopicVideoBy(podcastEpisode, skipSeconds)}
						onSpeedPress={() => cycleTopicVideoPlaybackRate(podcastEpisode)}
					/>
				</Group>
				<Group className="flex flex-row items-center gap-1.5">
					<ControlButton
						control="captions"
						label={isCaptionsShown ? "Hide captions" : "Show captions"}
						isPressed={isCaptionsShown}
						onPress={toggleCaptions}
					/>
					<ControlButton control="mute" label={isMuted ? "Unmute" : "Mute"} isPressed={isMuted} onPress={toggleMuted} />
					{surfaceControls.enterPictureInPicture && (
						<ControlButton
							control="pictureInPicture"
							label="Picture in picture"
							onPress={surfaceControls.enterPictureInPicture}
						/>
					)}
					{surfaceControls.enterFullscreen && (
						<ControlButton control="fullscreen" label="Fullscreen" onPress={surfaceControls.enterFullscreen} />
					)}
				</Group>
			</Group>
		</>
	)

	// a page's card, or the column inside the Video dialog's own frame
	if (isCard) {
		return (
			<Card>
				{/* the film title stays above the picture during playback, with the film's details in the top right */}
				<Group className="flex flex-row items-baseline justify-between gap-3">
					{podcastEpisode.title && (
						<Title className="min-w-0 flex-1 font-sans text-lg leading-snug font-bold">{podcastEpisode.title}</Title>
					)}
					<Text className="ml-auto shrink-0 text-xs text-muted-foreground sm:text-[0.8125rem]">
						{toDotSeparatedText(toPodcastEpisodeDayDurationAndChapterLabels(podcastEpisode))}
					</Text>
				</Group>
				{topicVideoPlayer}
				{cardFooter}
			</Card>
		)
	}
	return <Group className="flex flex-col gap-3">{topicVideoPlayer}</Group>
}

// isolate frequent position updates from the film's controls
function LoadedFilmSeekBar({
	podcastEpisode,
	SeekBar,
}: {
	podcastEpisode: PodcastEpisode
	SeekBar: TopicVideoPlayerElements["SeekBar"]
}) {
	const positionSeconds = usePlayerPositionSeconds()
	return <SeekBar podcastEpisode={podcastEpisode} positionSeconds={positionSeconds} isPodcastEpisodeLoaded />
}
