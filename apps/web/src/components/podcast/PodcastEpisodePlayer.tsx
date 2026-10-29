import {
	isPublishedPodcastEpisode,
	type PodcastEpisode,
	type PublishedPodcastEpisodeNumbers,
} from "@carlnotes/contracts/podcast"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useShownPodcastEpisode } from "@carlnotes/core/hooks/useShownPodcastEpisode"
import { useState } from "react"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { isManualScanShown } from "@/components/topic/TopicScanButton"
import { useSearchParams } from "@/hooks/useSearchParams"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { usePodcastEpisodePlayer } from "@/stores/podcastEpisodePlayerStore"
import { PodcastEpisodePlaybackPill } from "./PodcastEpisodePill"
import { PodcastEpisodePlayerCard } from "./PodcastEpisodePlayerCard"
import { PodcastFeedDialog } from "./PodcastFeedDialog"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { UnpublishedPodcastEpisodeCard } from "./UnpublishedPodcastEpisodeCard"

// the topic, the calls behind a chapter's topic finding note, and the scan button for a podcast episode that failed to
// record
type PodcastEpisodePlayerProps = {
	topic: TopicResponse
	topicFeedHandlers: TopicFeedHandlers
	scanControl: React.ReactNode
}

/**
 * The topic page's podcast episode player, or nothing if no podcast episode shows or is about to record.
 */
export function PodcastEpisodePlayer({ topic, topicFeedHandlers, scanControl }: PodcastEpisodePlayerProps) {
	// the loaded episode, the episode that this player shows, and whether the podcast feed dialog is open
	const { podcastEpisode: loadedPodcastEpisode } = usePodcastEpisodePlayer()
	const linkedPodcastEpisodeId = useSearchParams().get("episode")
	const { podcastEpisode, willScanRecordPodcastEpisode } = useShownPodcastEpisode({ topic, linkedPodcastEpisodeId })
	const [isPodcastFeedDialogOpen, setIsPodcastFeedDialogOpen] = useState(false)
	if (!podcastEpisode && !willScanRecordPodcastEpisode) {
		return null
	}

	// the title's aside is the playback pill once the podcast episode is loaded,
	// or "new episode" if the user has not started the episode
	const isPodcastEpisodeLoaded = podcastEpisode !== null && loadedPodcastEpisode?.id === podcastEpisode.id
	const isPodcastEpisodeUnplayed =
		podcastEpisode?.status === "published" && podcastEpisode.progressSeconds === 0 && !podcastEpisode.isCompleted
	const unplayedTitleAside = isPodcastEpisodeUnplayed ? (
		<span className="text-link text-sm font-bold whitespace-nowrap">new episode</span>
	) : undefined
	const titleAside = isPodcastEpisodeLoaded ? <PodcastEpisodePlaybackPill /> : unplayedTitleAside
	// the podcast episode with the season and number its player card and page path need, or null before it publishes
	const publishedPodcastEpisode = toPublishedPodcastEpisode(podcastEpisode)

	return (
		<CollapsibleSection
			value="podcast"
			title={PODCAST_NAME}
			titleNote={<PodcastThemeSongNote className="ml-0" />}
			titleAside={titleAside}
			className="mt-2"
		>
			{/* a published podcast episode's player card, or the card of an episode with no audio */}
			{publishedPodcastEpisode ? (
				<PodcastEpisodePlayerCard
					podcastEpisode={publishedPodcastEpisode}
					podcastEpisodePath={toPodcastEpisodePath(topic, publishedPodcastEpisode)}
					chapterTopicFeed={{
						topicFindings: topic.findings,
						topic: { id: topic.id, name: topic.name, prompt: topic.prompt, visibility: topic.visibility },
						isRatable: topic.canRate,
						isBookmarkable: topic.isTopicOwner || topic.isTeamMember,
						topicFeedHandlers,
					}}
					onOpenPodcastFeedDialog={() => setIsPodcastFeedDialogOpen(true)}
				/>
			) : (
				<UnpublishedPodcastEpisodeCard
					podcastEpisode={podcastEpisode}
					scanControl={isManualScanShown(topic) ? scanControl : undefined}
				/>
			)}
			{/* the podcast feed dialog */}
			{isPodcastFeedDialogOpen && <PodcastFeedDialog topic={topic} onClose={() => setIsPodcastFeedDialogOpen(false)} />}
		</CollapsibleSection>
	)
}

// the podcast episode once it is published with a season and a number, or null for one still recording or failed
function toPublishedPodcastEpisode(
	podcastEpisode: PodcastEpisode | null | undefined,
): (PodcastEpisode & PublishedPodcastEpisodeNumbers) | null {
	return podcastEpisode?.status === "published" && isPublishedPodcastEpisode(podcastEpisode) ? podcastEpisode : null
}
