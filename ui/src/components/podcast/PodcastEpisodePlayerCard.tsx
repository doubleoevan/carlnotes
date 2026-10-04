import type { PodcastEpisode } from "@shared/contracts"
import { AI_VOICES_NOTE } from "@shared/podcastEpisodes"
import { Pause, Play, RotateCcw, RotateCw, Rss } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import {
	type ChapterTopicFeed,
	PodcastEpisodeChapters,
	SHOWN_CHAPTER_COUNT,
} from "@/components/podcast/PodcastEpisodeChapters"
import { MoreButton } from "@/components/topic/MoreButton"
import { toClockLabel, toPodcastEpisodeDateLabel, toPodcastEpisodeDurationLabel } from "@/lib/labels"
import {
	INFO_CARD_CLASS,
	MENU_BUTTON_CLASS,
	PLAY_BUTTON_CLASS,
	PLAYBACK_CONTROL_BUTTON_CLASS,
	SCRIPTED_ONLY_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import {
	cyclePlaybackRate,
	playPodcastEpisode,
	SKIP_BACK_SECONDS,
	SKIP_FORWARD_SECONDS,
	seekPlaybackTo,
	skipPlaybackBy,
	toChapterIndexAt,
	togglePlayback,
	usePlayerPositionSeconds,
	usePodcastEpisodePlayer,
} from "@/stores/podcastEpisodePlayerStore"

// the button that opens the podcast feed dialog, in the primary color
const PODCAST_FEED_BUTTON_CLASS = cn(
	MENU_BUTTON_CLASS,
	"bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
	"border-transparent px-4 font-semibold",
)

// a published podcast episode, what its chapters' topic finding notes read, and the calls behind the card's buttons
type PodcastEpisodePlayerCardProps = {
	podcastEpisode: PodcastEpisode
	// the path of the podcast episode's own page, if the title links to the page
	podcastEpisodePath?: string
	chapterTopicFeed: ChapterTopicFeed
	onOpenPodcastFeedDialog: () => void
}

/**
 * A published podcast episode's player card, with the seek bar, the chapter list, and the podcast feed button.
 */
export function PodcastEpisodePlayerCard({
	podcastEpisode,
	podcastEpisodePath,
	chapterTopicFeed,
	onOpenPodcastFeedDialog,
}: PodcastEpisodePlayerCardProps) {
	// the position that this card shows, and the chapter at that position.
	// a podcast episode that is not loaded shows the user's saved progress
	const { podcastEpisode: loadedPodcastEpisode, isPlaying, playbackRate } = usePodcastEpisodePlayer()
	const positionSeconds = usePlayerPositionSeconds()
	const isPodcastEpisodeLoaded = loadedPodcastEpisode?.id === podcastEpisode.id
	const shownPositionSeconds = isPodcastEpisodeLoaded ? positionSeconds : podcastEpisode.progressSeconds
	const shownChapterIndex = toChapterIndexAt(podcastEpisode.chapters, shownPositionSeconds)

	// play or pause this podcast episode if the episode is loaded, and load and play the episode otherwise
	const handleTogglePlayback = (): void => {
		if (isPodcastEpisodeLoaded) {
			togglePlayback()
		} else {
			void playPodcastEpisode(podcastEpisode)
		}
	}

	// the play button's label, which says pause only while this podcast episode plays
	const playButtonLabel = `${isPodcastEpisodeLoaded && isPlaying ? "Pause" : "Play"} episode ${podcastEpisode.episodeNumber}`

	// whether every chapter shows, and how many chapters are hidden until the list is expanded
	const [isChapterListExpanded, setIsChapterListExpanded] = useState(false)
	const hiddenChapterCount = podcastEpisode.chapters.length - SHOWN_CHAPTER_COUNT
	return (
		<>
			<div className={cn(INFO_CARD_CLASS, "flex flex-col gap-4")}>
				<div className="flex flex-wrap items-center gap-4">
					{/* the play button beside the podcast episode's details. the controls wrap under both on a phone */}
					<div className="flex min-w-0 flex-[1_1_18rem] items-center gap-4">
						<button
							type="button"
							aria-label={playButtonLabel}
							onClick={handleTogglePlayback}
							className={cn(PLAY_BUTTON_CLASS, "size-14 sm:size-16")}
						>
							{isPodcastEpisodeLoaded && isPlaying ? (
								<Pause className="size-6 fill-current" />
							) : (
								<Play className="size-7 fill-current" />
							)}
						</button>

						<PodcastEpisodeDetails
							podcastEpisode={podcastEpisode}
							podcastEpisodePath={podcastEpisodePath}
							playerChapterIndex={isPodcastEpisodeLoaded ? shownChapterIndex : null}
						/>
					</div>

					{/* the skip and playback rate buttons once the podcast episode is loaded,
					    and the podcast feed button on a wide screen */}
					<div className="flex shrink-0 items-center gap-1.5">
						{isPodcastEpisodeLoaded && <PlaybackControls playbackRate={playbackRate} />}
						<PodcastFeedButton
							onOpenPodcastFeedDialog={onOpenPodcastFeedDialog}
							className="hidden sm:flex"
							label="Subscribe"
						/>
					</div>
				</div>

				{/* the seek bar, then the chapter list */}
				<PodcastEpisodeSeekBar
					podcastEpisode={podcastEpisode}
					positionSeconds={shownPositionSeconds}
					isPodcastEpisodeLoaded={isPodcastEpisodeLoaded}
				/>
				<PodcastEpisodeChapters
					podcastEpisode={podcastEpisode}
					playerChapterIndex={isPodcastEpisodeLoaded ? shownChapterIndex : null}
					isExpanded={isChapterListExpanded}
					chapterTopicFeed={chapterTopicFeed}
				/>

				{/* the podcast feed button on a phone, as wide as the card */}
				<PodcastFeedButton
					onOpenPodcastFeedDialog={onOpenPodcastFeedDialog}
					className="flex justify-center sm:hidden"
					label="Subscribe to podcast"
				/>
			</div>
			{/* the control under the card that shows the rest of the chapters. without JavaScript every chapter shows */}
			{hiddenChapterCount > 0 && (
				<MoreButton
					isExpanded={isChapterListExpanded}
					moreLabel={`+ ${hiddenChapterCount} chapters `}
					onToggle={() => setIsChapterListExpanded(!isChapterListExpanded)}
					className={SCRIPTED_ONLY_CLASS}
				/>
			)}
		</>
	)
}

// the podcast episode, the path of its own page if the title links there, and the index of the player's chapter
type PodcastEpisodeDetailsProps = {
	podcastEpisode: PodcastEpisode
	podcastEpisodePath?: string
	playerChapterIndex: number | null
}

// the podcast episode's season and episode number, its title, and a line with its date, its duration, its chapter count,
// and the AI voices note. the player's chapter shows in place of that line if the episode is loaded
function PodcastEpisodeDetails({ podcastEpisode, podcastEpisodePath, playerChapterIndex }: PodcastEpisodeDetailsProps) {
	const playerChapter = playerChapterIndex === null ? undefined : podcastEpisode.chapters[playerChapterIndex]
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			{/* the season and episode number */}
			<div className="text-muted-foreground font-display text-sm tracking-wide">
				{`Season ${podcastEpisode.season} · Episode ${podcastEpisode.episodeNumber}`}
			</div>
			{/* the title, linked to the podcast episode's own page if there is a path */}
			<div className="text-lg leading-snug font-bold">
				{podcastEpisodePath ? (
					<AnchorLink href={podcastEpisodePath} className="hover:underline">
						{podcastEpisode.title}
					</AnchorLink>
				) : (
					podcastEpisode.title
				)}
			</div>
			{/* the player's chapter, or the date, duration, chapter count, and AI voices note */}
			<div className="text-muted-foreground text-xs sm:text-[0.8125rem]" suppressHydrationWarning>
				{playerChapter && playerChapterIndex !== null
					? `Chapter ${playerChapterIndex + 1} of ${podcastEpisode.chapters.length} · ${playerChapter.title}`
					: [
							toPodcastEpisodeDateLabel(podcastEpisode.publishedAt),
							toPodcastEpisodeDurationLabel(podcastEpisode.durationSeconds),
							`${podcastEpisode.chapters.length} chapters`,
							AI_VOICES_NOTE,
						].join(" · ")}
			</div>
		</div>
	)
}

// the skip back, skip forward, and playback rate buttons of the loaded podcast episode
function PlaybackControls({ playbackRate }: { playbackRate: number }) {
	return (
		<>
			<button
				type="button"
				aria-label={`Back ${SKIP_BACK_SECONDS} seconds`}
				onClick={() => skipPlaybackBy(-SKIP_BACK_SECONDS)}
				className={PLAYBACK_CONTROL_BUTTON_CLASS}
			>
				<RotateCcw className="size-4.5" />
			</button>
			<button
				type="button"
				aria-label={`Forward ${SKIP_FORWARD_SECONDS} seconds`}
				onClick={() => skipPlaybackBy(SKIP_FORWARD_SECONDS)}
				className={PLAYBACK_CONTROL_BUTTON_CLASS}
			>
				<RotateCw className="size-4.5" />
			</button>
			<button
				type="button"
				aria-label="Playback speed"
				onClick={cyclePlaybackRate}
				className={PLAYBACK_CONTROL_BUTTON_CLASS}
			>
				{`${playbackRate}x`}
			</button>
		</>
	)
}

// the button that opens the podcast feed dialog
function PodcastFeedButton({
	onOpenPodcastFeedDialog,
	className,
	label,
}: {
	onOpenPodcastFeedDialog: () => void
	className: string
	label: string
}) {
	return (
		<button type="button" onClick={onOpenPodcastFeedDialog} className={cn(PODCAST_FEED_BUTTON_CLASS, className)}>
			<Rss className="size-4" />
			{label}
		</button>
	)
}

// the seek bar, with one segment per chapter, each as wide as the chapter is long
function PodcastEpisodeSeekBar({
	podcastEpisode,
	positionSeconds,
	isPodcastEpisodeLoaded,
}: {
	podcastEpisode: PodcastEpisode
	positionSeconds: number
	isPodcastEpisodeLoaded: boolean
}) {
	const durationSeconds = podcastEpisode.durationSeconds ?? 0

	// seek the loaded podcast episode, or play this podcast episode from the position
	const handleSeek = (seekSeconds: number): void => {
		if (isPodcastEpisodeLoaded) {
			seekPlaybackTo(seekSeconds)
		} else {
			void playPodcastEpisode(podcastEpisode, seekSeconds)
		}
	}
	return (
		<div className="flex items-center gap-3">
			{/* the position, shown on a wide screen */}
			<span className="text-muted-foreground hidden text-xs tabular-nums sm:block">
				{toClockLabel(positionSeconds)}
			</span>
			{/* one segment per chapter, filled as far as the chapter has played */}
			<div className="relative flex flex-1 gap-1">
				{podcastEpisode.chapters.map((chapter) => {
					// how long the chapter runs, and how much of the chapter has played as a percent
					const chapterDurationSeconds = Math.max(1, chapter.endSeconds - chapter.startSeconds)
					const playedSeconds = positionSeconds - chapter.startSeconds
					const playedPercent = Math.min(100, Math.max(0, (playedSeconds / chapterDurationSeconds) * 100))
					return (
						<div
							key={chapter.position}
							className="bg-muted h-1.5 overflow-hidden rounded-full"
							style={{ flex: `${chapterDurationSeconds} 1 0` }}
							aria-hidden="true"
						>
							<div className="bg-primary h-full" style={{ width: `${playedPercent}%` }} />
						</div>
					)
				})}
				{/* the range input that seeks, or that starts a podcast episode that is not loaded */}
				<input
					type="range"
					aria-label="Seek"
					min={0}
					max={durationSeconds}
					value={Math.min(positionSeconds, durationSeconds)}
					onChange={(event) => handleSeek(Number(event.target.value))}
					className="absolute inset-x-0 -inset-y-3 cursor-pointer opacity-0"
				/>
			</div>
			{/* the podcast episode's duration, shown on a wide screen */}
			<span className="text-muted-foreground hidden text-xs tabular-nums sm:block">
				{toClockLabel(durationSeconds)}
			</span>
		</div>
	)
}
