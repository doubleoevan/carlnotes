import { Pause, Play } from "lucide-react"
import { type ReactNode, useEffect, useRef } from "react"
import { authClient } from "@/clients/authClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { SkipPlaybackButtons } from "@/components/podcast/PlaybackControlButtons"
import { PodcastEpisodeCover } from "@/components/podcast/PodcastEpisodeCover"
import { PodcastEpisodeTooltip } from "@/components/podcast/PodcastEpisodeDetails"
import { toClockLabel, toPodcastEpisodeTitleLabel } from "@/lib/labels"
import { toChapterIndexAt } from "@/lib/podcastEpisodePlayback"
import { PLAY_BUTTON_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import {
	registerPodcastEpisodeAudio,
	seekPlaybackTo,
	setIsUserSignedIn,
	togglePlayback,
	usePlayerPositionSeconds,
	usePodcastEpisodePlayer,
} from "@/stores/podcastEpisodePlayerStore"

/**
 * The audio element that the player store drives, with the podcast player that shows while a podcast episode is loaded.
 */
export function PodcastEpisodeAudio() {
	// register the audio element with the player store
	const audioRef = useRef<HTMLAudioElement>(null)
	useEffect(() => (audioRef.current ? registerPodcastEpisodeAudio(audioRef.current) : undefined), [])

	// tell the player store whether the user is signed in
	const { data: session } = authClient.useSession()
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

// the podcast player, fixed to the bottom of the page while a podcast episode is loaded
function PodcastPlayer() {
	const { podcastEpisode, isPlaying } = usePodcastEpisodePlayer()
	const positionSeconds = usePlayerPositionSeconds()
	if (!podcastEpisode) {
		return null
	}

	// how much of the podcast episode has played, the player's chapter, the title line, and the play button's label
	const durationSeconds = podcastEpisode.durationSeconds ?? 0
	const playedPercent = Math.min(100, (positionSeconds / Math.max(1, durationSeconds)) * 100)
	const playerChapterIndex = toChapterIndexAt(podcastEpisode.chapters, positionSeconds)
	const playerChapter = podcastEpisode.chapters[playerChapterIndex]
	const podcastEpisodeTitle = toPodcastEpisodeTitleLabel(podcastEpisode)
	const playButtonLabel = `${isPlaying ? "Pause" : "Play"} episode ${podcastEpisode.episodeNumber ?? ""}`.trim()
	return (
		<div className="bg-card border-separator-strong fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]">
			{/* the progress line, under the seek input */}
			<div className="bg-muted relative h-0.75">
				<div className="bg-primary h-full" style={{ width: `${playedPercent}%` }} aria-hidden="true" />
				{/* the seek input over the line, taller than the line for a bigger click area */}
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
			<div className="mx-auto flex max-w-5xl items-center gap-3 py-2.5 pr-3 pl-4">
				{/* the podcast episode's cover and title, which link to its page once it has one */}
				<PodcastEpisodeLink pagePath={podcastEpisode.pagePath}>
					<PodcastEpisodeCover podcastEpisode={podcastEpisode} className="size-11" />
					{/* the podcast episode's number and title with the episode's details as a tooltip, over the player's
					    chapter or the position */}
					<div className="min-w-0 flex-1">
						<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
							<div className="truncate text-sm font-bold group-hover:underline">{podcastEpisodeTitle}</div>
						</PodcastEpisodeTooltip>
						<div className="text-muted-foreground truncate text-xs">
							{playerChapter
								? `Ch ${playerChapterIndex + 1} of ${podcastEpisode.chapters.length} · ${playerChapter.title}`
								: toClockLabel(positionSeconds)}
						</div>
					</div>
				</PodcastEpisodeLink>
				{/* the skip buttons and the play button */}
				<SkipPlaybackButtons />
				<button
					type="button"
					aria-label={playButtonLabel}
					onClick={togglePlayback}
					className={cn(PLAY_BUTTON_CLASS, "size-11")}
				>
					{isPlaying ? <Pause className="size-4.5 fill-current" /> : <Play className="size-4.5 fill-current" />}
				</button>
			</div>
		</div>
	)
}

// the link to the podcast episode's page around the cover and the title, or a plain box before the episode has a page.
// a hover anywhere in it underlines the title
function PodcastEpisodeLink({ pagePath, children }: { pagePath: string | null; children: ReactNode }) {
	const podcastEpisodeLinkClass = "group flex min-w-0 flex-1 items-center gap-3"
	return pagePath ? (
		<AnchorLink href={pagePath} className={podcastEpisodeLinkClass}>
			{children}
		</AnchorLink>
	) : (
		<div className={podcastEpisodeLinkClass}>{children}</div>
	)
}
