import { authClient } from "@carlnotes/client/authClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	type PodcastPlayerElements,
	PodcastPlayer as SharedPodcastPlayer,
} from "@carlnotes/core/components/PodcastPlayer"
import { toPodcastEpisodeQuestionLabel } from "@carlnotes/core/stores/podcastEpisodeQuestionRules"
import { usePodcastEpisodeQuestion } from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import { useEffect, useRef } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { registerPodcastEpisodeAudio, seekPlaybackTo, setIsUserSignedIn } from "@/stores/podcastEpisodePlayerStore"
import { SkipPlaybackButtons } from "./PlaybackControlButtons"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"
import { PodcastEpisodeTooltip } from "./PodcastEpisodeDetails"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import {
	isPodcastEpisodeQuestionButtonShown,
	PodcastEpisodeQuestionButton,
	PodcastEpisodeQuestionStopButton,
} from "./PodcastEpisodeQuestionControls"

/**
 * The audio element that the player store drives, with the podcast player that shows while a podcast episode is loaded.
 */
export function PodcastEpisodeAudio() {
	// register the audio element with the player store
	const audioRef = useRef<HTMLAudioElement>(null)
	useEffect(() => (audioRef.current ? registerPodcastEpisodeAudio(audioRef.current) : undefined), [])

	// tell the player store whether the user is signed in
	const { data: session } = authClient().useSession()
	useEffect(() => setIsUserSignedIn(Boolean(session)), [session])
	return (
		<>
			{/* biome-ignore lint/a11y/useMediaCaption: each podcast episode's transcript is on its own page */}
			<audio ref={audioRef} preload="none" />
			{/* the podcast player */}
			<PodcastPlayer />
		</>
	)
}

// adapt the shared mini player while preserving browser voice controls
function PodcastPlayer() {
	const question = usePodcastEpisodeQuestion()
	return <SharedPodcastPlayer phaseLabel={toPodcastEpisodeQuestionLabel(question)} elements={elements} />
}

const elements: PodcastPlayerElements = {
	Frame: ({ children }) => (
		<div className="bg-card border-separator-strong fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]">
			{children}
		</div>
	),
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <div className={className}>{children}</div>,
	Link: ({ pagePath, children }) =>
		pagePath ? (
			<AnchorLink href={pagePath} className="group flex min-w-0 flex-1 items-center gap-3">
				{children}
			</AnchorLink>
		) : (
			<div className="group flex min-w-0 flex-1 items-center gap-3">{children}</div>
		),
	Cover: PodcastEpisodeCover,
	Tooltip: PodcastEpisodeTooltip,
	Announcement: ({ children }) => (
		<span className="sr-only" aria-live="polite">
			{children}
		</span>
	),
	Progress: ({ positionSeconds, durationSeconds, playedPercent }) => (
		<div className="bg-muted relative h-0.75">
			<div className="bg-primary h-full" style={{ width: `${playedPercent}%` }} aria-hidden="true" />
			<input
				type="range"
				aria-label="Seek"
				min={0}
				max={durationSeconds}
				value={Math.min(positionSeconds, durationSeconds)}
				onChange={(event) => seekPlaybackTo(Number(event.target.value))}
				className="absolute inset-x-0 -inset-y-2.5 cursor-pointer opacity-0"
			/>
		</div>
	),
	Controls: PodcastPlayerControls,
	Play: ({ podcastEpisode }) => <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />,
}

// preserve the spoken-question replacement for skips and the optional microphone
function PodcastPlayerControls({ podcastEpisode }: { podcastEpisode: PodcastEpisode }) {
	const question = usePodcastEpisodeQuestion()
	return (
		<>
			{toPodcastEpisodeQuestionLabel(question) ? <PodcastEpisodeQuestionStopButton /> : <SkipPlaybackButtons />}
			{isPodcastEpisodeQuestionButtonShown(podcastEpisode) && (
				<PodcastEpisodeQuestionButton podcastEpisode={podcastEpisode} />
			)}
		</>
	)
}
