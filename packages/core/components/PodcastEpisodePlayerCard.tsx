import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { type ComponentType, type ReactNode, useState } from "react"
import { toChapterIndexAt } from "../lib/podcastEpisodePlayback"
import {
	playPodcastEpisode,
	togglePlayback,
	toPodcastEpisodePlayerState,
	usePlayerPositionSeconds,
	usePodcastEpisodePlayer,
} from "../stores/podcastEpisodePlayerStore"
import { SHOWN_CHAPTER_COUNT } from "./PodcastEpisodeChapters"
import type { PodcastEpisodeDetailsProps } from "./PodcastEpisodeDetails"

// the player layout uses each app's existing controls and rendering primitives
export type PodcastEpisodePlayerCardElements<T> = {
	Group: ComponentType<{ children: ReactNode; className?: string }>
	Card: ComponentType<{ children: ReactNode }>
	PlayButton: ComponentType<{ podcastEpisode: PodcastEpisode; size: "lg"; onPress: () => void }>
	Details: ComponentType<PodcastEpisodeDetailsProps>
	Controls: ComponentType<{ podcastEpisode: PodcastEpisode; playbackRate: number }>
	SeekBar: ComponentType<{ podcastEpisode: PodcastEpisode; positionSeconds: number; isPodcastEpisodeLoaded: boolean }>
	Chapters: ComponentType<{
		podcastEpisode: PodcastEpisode
		playerChapterIndex: number | null
		isExpanded: boolean
		chapterTopicFeed: T
	}>
	FeedButton: ComponentType<{ onPress: () => void; className: string; label: string }>
	More: ComponentType<{ isExpanded: boolean; moreLabel: string; onToggle: () => void; className?: string }>
	Feedback: ComponentType<{ isLoading: boolean; errorMessage: string | null }>
}

/**
 * Composes one player card, its loaded controls, segmented seek bar, and expandable chapters for both apps.
 */
export function PodcastEpisodePlayerCard<T>({
	podcastEpisode,
	podcastEpisodePath,
	chapterTopicFeed,
	onOpenPodcastFeedDialog,
	elements: { Group, Card, PlayButton, Details, Controls, SeekBar, Chapters, FeedButton, More, Feedback },
}: {
	podcastEpisode: PodcastEpisode
	podcastEpisodePath?: string
	chapterTopicFeed: T
	onOpenPodcastFeedDialog: () => void
	elements: PodcastEpisodePlayerCardElements<T>
}) {
	// show live progress only for the loaded episode
	const player = usePodcastEpisodePlayer()
	const isLoaded = player.podcastEpisode?.id === podcastEpisode.id
	const shownPosition = isLoaded ? toPodcastEpisodePlayerState().positionSeconds : podcastEpisode.progressSeconds
	const chapterIndex = toChapterIndexAt(podcastEpisode.chapters, shownPosition)
	const [isExpanded, setIsExpanded] = useState(false)
	const hiddenChapterCount = podcastEpisode.chapters.length - SHOWN_CHAPTER_COUNT
	return (
		<>
			<Card>
				{/* episode identity and playback controls */}
				<Group className="flex flex-row flex-wrap items-center gap-4">
					<Group className="flex min-w-0 flex-[1_1_18rem] flex-row items-center gap-4">
						<PlayButton
							podcastEpisode={podcastEpisode}
							size="lg"
							onPress={() => {
								if (isLoaded) {
									togglePlayback()
								} else {
									void playPodcastEpisode(podcastEpisode)
								}
							}}
						/>
						<Details
							podcastEpisode={podcastEpisode}
							podcastEpisodePath={podcastEpisodePath}
							playerChapterIndex={isLoaded ? chapterIndex : null}
						/>
					</Group>
					<Group className="flex shrink-0 flex-row items-center gap-1.5">
						{isLoaded && <Controls podcastEpisode={podcastEpisode} playbackRate={player.playbackRate} />}
						<FeedButton onPress={onOpenPodcastFeedDialog} className="hidden sm:flex" label="Subscribe" />
					</Group>
				</Group>
				{/* playback feedback, progress, and chapter actions */}
				{isLoaded && <Feedback isLoading={player.isLoading} errorMessage={player.errorMessage} />}
				{isLoaded ? (
					<LoadedSeekBar podcastEpisode={podcastEpisode} SeekBar={SeekBar} />
				) : (
					<SeekBar podcastEpisode={podcastEpisode} positionSeconds={shownPosition} isPodcastEpisodeLoaded={false} />
				)}
				<Chapters
					podcastEpisode={podcastEpisode}
					playerChapterIndex={isLoaded ? chapterIndex : null}
					isExpanded={isExpanded}
					chapterTopicFeed={chapterTopicFeed}
				/>
				{/* phone subscription action */}
				<FeedButton
					onPress={onOpenPodcastFeedDialog}
					className="flex justify-center sm:hidden"
					label="Subscribe to podcast"
				/>
			</Card>
			{/* expand the existing chapters without replacing the loaded player */}
			{hiddenChapterCount > 0 && (
				<More
					isExpanded={isExpanded}
					moreLabel={`+ ${hiddenChapterCount} chapters `}
					onToggle={() => setIsExpanded(!isExpanded)}
					className="scripted-only"
				/>
			)}
		</>
	)
}

// isolate frequent position updates from the episode identity and chapter rows
function LoadedSeekBar({
	podcastEpisode,
	SeekBar,
}: {
	podcastEpisode: PodcastEpisode
	SeekBar: PodcastEpisodePlayerCardElements<unknown>["SeekBar"]
}) {
	const positionSeconds = usePlayerPositionSeconds()
	return <SeekBar podcastEpisode={podcastEpisode} positionSeconds={positionSeconds} isPodcastEpisodeLoaded />
}
