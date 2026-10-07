import type { PodcastEpisode, TopicResponse } from "@shared/contracts"
import { PODCAST_NAME } from "@shared/podcastEpisodes"
import { toPodcastEpisodePath } from "@shared/seo"
import { useEffect, useState } from "react"
import { fetchPodcastEpisode } from "@/clients/podcastEpisodeClient"
import { PodcastEpisodeCover } from "@/components/podcast/PodcastEpisodeCover"
import { PodcastEpisodePlaybackPill } from "@/components/podcast/PodcastEpisodePill"
import { PodcastEpisodePlayerCard } from "@/components/podcast/PodcastEpisodePlayerCard"
import { PodcastFeedDialog } from "@/components/podcast/PodcastFeedDialog"
import { RemovePodcastEpisodeDialog } from "@/components/podcast/RemovePodcastEpisodeDialog"
import { ThemeSongNote } from "@/components/podcast/ThemeSongNote"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { isManualScanShown } from "@/components/topic/TopicScanButton"
import { useSearchParams } from "@/hooks/useSearchParams"
import { COVER_RECORDING_CLASS, INFO_CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { usePodcastEpisodePlayer } from "@/stores/podcastEpisodePlayerStore"

// how often a podcast episode that is still rendering is checked for its audio
const RENDERING_POLL_MS = 5_000

// the topic, the calls behind a chapter's topic finding note, the scan button for a podcast episode that failed to render,
// and the call that runs after the podcast episode is removed
type PodcastEpisodePlayerProps = {
	topic: TopicResponse
	topicHandlers: TopicFeedHandlers
	scanControl: React.ReactNode
	onPodcastEpisodeRemoved: () => Promise<void>
}

/**
 * The topic page's podcast episode player, or nothing if no podcast episode shows or is about to render.
 */
export function PodcastEpisodePlayer({
	topic,
	topicHandlers,
	scanControl,
	onPodcastEpisodeRemoved,
}: PodcastEpisodePlayerProps) {
	// the loaded episode, the episode that this player shows, and whether the podcast feed or remove dialog is open
	const { podcastEpisode: loadedPodcastEpisode } = usePodcastEpisodePlayer()
	const { podcastEpisode, willScanRenderPodcastEpisode } = useShownPodcastEpisode(topic)
	const [isPodcastFeedDialogOpen, setIsPodcastFeedDialogOpen] = useState(false)
	const [isRemovePodcastEpisodeDialogOpen, setIsRemovePodcastEpisodeDialogOpen] = useState(false)
	if (!podcastEpisode && !willScanRenderPodcastEpisode) {
		return null
	}

	// the title's aside is the playback pill once the podcast episode is loaded,
	// or "new episode" if the user has not started the episode
	const isPodcastEpisodeLoaded = podcastEpisode !== null && loadedPodcastEpisode?.id === podcastEpisode.id
	const isPodcastEpisodeUnplayed =
		podcastEpisode?.status === "published" && podcastEpisode.progressSeconds === 0 && !podcastEpisode.isCompleted
	const unplayedTitleAside = isPodcastEpisodeUnplayed ? (
		<span className="text-primary text-sm font-bold whitespace-nowrap">new episode</span>
	) : undefined
	const titleAside = isPodcastEpisodeLoaded ? <PodcastEpisodePlaybackPill /> : unplayedTitleAside
	return (
		<CollapsibleSection
			value="podcast"
			title={PODCAST_NAME}
			titleNote={<ThemeSongNote className="ml-0" />}
			titleAside={titleAside}
			className="mt-2"
		>
			{/* a published podcast episode's player card, or the card of an episode with no audio */}
			{podcastEpisode?.status === "published" ? (
				<PodcastEpisodePlayerCard
					podcastEpisode={podcastEpisode}
					podcastEpisodePath={toPodcastEpisodePath(topic, podcastEpisode)}
					chapterTopicFeed={{
						topicFindings: topic.findings,
						topic: { id: topic.id, name: topic.name, prompt: topic.prompt },
						isRatable: topic.canRate,
						isBookmarkable: topic.isTopicOwner || topic.isTeamMember,
						topicHandlers,
					}}
					onOpenPodcastFeedDialog={() => setIsPodcastFeedDialogOpen(true)}
					onRemovePodcastEpisode={
						topic.podcast?.canRemovePodcastEpisodes ? () => setIsRemovePodcastEpisodeDialogOpen(true) : undefined
					}
				/>
			) : (
				<UnpublishedPodcastEpisodeCard
					podcastEpisode={podcastEpisode ?? UNTITLED_RENDERING_PODCAST_EPISODE}
					scanControl={isManualScanShown(topic) ? scanControl : undefined}
				/>
			)}
			{/* the podcast feed dialog */}
			{isPodcastFeedDialogOpen && <PodcastFeedDialog topic={topic} onClose={() => setIsPodcastFeedDialogOpen(false)} />}
			{/* the dialog that confirms removing the podcast episode */}
			{isRemovePodcastEpisodeDialogOpen && podcastEpisode && (
				<RemovePodcastEpisodeDialog
					podcastEpisode={podcastEpisode}
					onPodcastEpisodeRemoved={onPodcastEpisodeRemoved}
					onClose={() => setIsRemovePodcastEpisodeDialogOpen(false)}
				/>
			)}
		</CollapsibleSection>
	)
}

// the podcast episode that the player shows, and whether a running scan is about to render an episode instead
type ShownPodcastEpisodeState = { podcastEpisode: PodcastEpisode | null; willScanRenderPodcastEpisode: boolean }

// the podcast episode that the player shows. this topic's loaded episode comes first, then the linked episode,
// then a rendering episode, then a running scan's next episode, then a failed episode, then the latest episode
function useShownPodcastEpisode(topic: TopicResponse): ShownPodcastEpisodeState {
	const linkedPodcastEpisodeId = useSearchParams().get("episode")
	const [linkedPodcastEpisode, setLinkedPodcastEpisode] = useState<PodcastEpisode | null>(null)
	const { podcastEpisode: loadedPodcastEpisode } = usePodcastEpisodePlayer()
	const topicId = topic.id
	useEffect(() => {
		// clear the linked podcast episode if the url names none
		if (!linkedPodcastEpisodeId) {
			setLinkedPodcastEpisode(null)
			return
		}

		// load the linked podcast episode, and poll again while the episode is rendering
		let isCurrentLinkedPodcastEpisode = true
		let renderingPollTimer: ReturnType<typeof setTimeout> | undefined
		const loadLinkedPodcastEpisode = async (): Promise<void> => {
			const fetchedPodcastEpisode = await fetchPodcastEpisode(linkedPodcastEpisodeId)
			if (!isCurrentLinkedPodcastEpisode) {
				return
			}

			// keep the linked podcast episode only if the episode is this topic's
			const topicPodcastEpisode = fetchedPodcastEpisode?.topicId === topicId ? fetchedPodcastEpisode : null
			setLinkedPodcastEpisode(topicPodcastEpisode)
			if (topicPodcastEpisode?.status === "rendering") {
				renderingPollTimer = setTimeout(loadLinkedPodcastEpisode, RENDERING_POLL_MS)
			}
		}
		void loadLinkedPodcastEpisode()

		// stop the poll when the linked podcast episode changes
		return () => {
			isCurrentLinkedPodcastEpisode = false
			clearTimeout(renderingPollTimer)
		}
	}, [linkedPodcastEpisodeId, topicId])

	// this topic's loaded podcast episode, the linked episode, or the episode that is rendering
	const { podcast } = topic
	const unpublishedPodcastEpisode = podcast?.unpublishedPodcastEpisode ?? null
	const topicLoadedPodcastEpisode = loadedPodcastEpisode?.topicId === topic.id ? loadedPodcastEpisode : null
	const renderingPodcastEpisode = unpublishedPodcastEpisode?.status === "rendering" ? unpublishedPodcastEpisode : null
	const shownPodcastEpisode = topicLoadedPodcastEpisode ?? linkedPodcastEpisode ?? renderingPodcastEpisode
	if (shownPodcastEpisode) {
		return { podcastEpisode: shownPodcastEpisode, willScanRenderPodcastEpisode: false }
	}

	// a running scan is about to render an episode if the podcast is on and the owner's plan still renders episodes
	const isScanRunning = topic.scans.some((topicScan) => topicScan.status === "running")
	if (isScanRunning && podcast?.isEnabled && podcast.canRenderPodcastEpisode) {
		return { podcastEpisode: null, willScanRenderPodcastEpisode: true }
	}

	// a podcast episode that failed to render shows only to a user who may scan the topic.
	// every other user gets the latest episode
	const failedPodcastEpisode = isManualScanShown(topic) ? unpublishedPodcastEpisode : null
	return {
		podcastEpisode: failedPodcastEpisode ?? topic.latestPodcastEpisode,
		willScanRenderPodcastEpisode: false,
	}
}

// the fields that the card of a podcast episode with no audio shows
type UnpublishedPodcastEpisode = Pick<PodcastEpisode, "status" | "title" | "smallCoverUrl">

// the podcast episode that a running scan is about to render, which has no title and no cover yet
const UNTITLED_RENDERING_PODCAST_EPISODE: UnpublishedPodcastEpisode = {
	status: "rendering",
	title: null,
	smallCoverUrl: null,
}

// the podcast episode with no audio, and the scan button if the user may scan the topic
type UnpublishedPodcastEpisodeCardProps = { podcastEpisode: UnpublishedPodcastEpisode; scanControl?: React.ReactNode }

// the card of a podcast episode with no audio, which is still rendering or failed to render.
// a failed episode's card has the scan button
function UnpublishedPodcastEpisodeCard({ podcastEpisode, scanControl }: UnpublishedPodcastEpisodeCardProps) {
	return (
		<div className={cn(INFO_CARD_CLASS, "flex items-center gap-4")}>
			{/* the podcast episode's cover. a rendering episode shows the recording cover until its own cover loads */}
			<PodcastEpisodeCover
				podcastEpisode={podcastEpisode}
				className={cn(
					"border-separator shadow-lift size-24 border sm:size-36",
					podcastEpisode.status === "rendering" && COVER_RECORDING_CLASS,
				)}
			/>
			<div className="flex min-w-0 flex-col gap-1">
				{/* the podcast episode's title, or the show's name until the title is written */}
				<div className="text-lg leading-snug font-bold">{podcastEpisode.title ?? PODCAST_NAME}</div>
				{/* the recording line while the podcast episode renders, or the failure line */}
				{podcastEpisode.status === "rendering" && (
					<p className="text-base font-semibold sm:text-lg">
						{/* the emoji sits outside the shimmer, which paints its text with a clipped gradient */}
						<span aria-hidden="true" className="mr-1.5">
							🤫
						</span>
						<span className="shimmer-text">Carl and Vienna are recording...</span>
					</p>
				)}
				{podcastEpisode.status !== "rendering" && (
					<p className="text-muted-foreground text-sm">{`${PODCAST_NAME} failed to record.`}</p>
				)}
				{/* the scan button, under a failed podcast episode's line */}
				{podcastEpisode.status !== "rendering" && scanControl && (
					<div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">{scanControl}</div>
				)}
			</div>
		</div>
	)
}
