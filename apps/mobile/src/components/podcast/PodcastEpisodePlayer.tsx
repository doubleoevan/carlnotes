import { isPublishedPodcastEpisode, type PodcastEpisode } from "@carlnotes/contracts/podcast"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useShownPodcastEpisode } from "@carlnotes/core/hooks/useShownPodcastEpisode"
import type { TopicFeedHandlers } from "@carlnotes/core/hooks/useTopicFindingActions"
import { isManualScanShown } from "@carlnotes/core/lib/topicActions"
import { usePodcastEpisodePlayer } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { onlineManager } from "@tanstack/react-query"
import { useLocalSearchParams } from "expo-router"
import { type ComponentRef, type ReactNode, useRef, useState, useSyncExternalStore } from "react"
import type { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { useIsScreenActive } from "@/hooks/useIsScreenActive"
import { PodcastEpisodePlaybackPill } from "./PodcastEpisodePill"
import { PodcastEpisodePlayerCard } from "./PodcastEpisodePlayerCard"
import { PodcastFeedDialog } from "./PodcastFeedDialog"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { UnpublishedPodcastEpisodeCard } from "./UnpublishedPodcastEpisodeCard"

/**
 * Selects the same loaded, linked, recording, failed, or latest episode as the web Topic player.
 */
export function PodcastEpisodePlayer({
	topic,
	topicFeedHandlers,
	scanControl,
}: {
	topic: TopicResponse
	topicFeedHandlers: TopicFeedHandlers
	scanControl?: ReactNode
}) {
	// follow explicit episode links without automatically starting playback
	const isScreenActive = useIsScreenActive()
	const isOnline = useSyncExternalStore(onlineManager.subscribe, () => onlineManager.isOnline())
	const params = useLocalSearchParams<{ episode?: string }>()
	const { podcastEpisode, willScanRecordPodcastEpisode } = useShownPodcastEpisode({
		topic,
		linkedPodcastEpisodeId: params.episode,
		isActive: isScreenActive && isOnline,
	})
	const player = usePodcastEpisodePlayer()
	const [isFeedOpen, setIsFeedOpen] = useState(false)
	const feedButtonRef = useRef<ComponentRef<typeof View>>(null)
	if (!podcastEpisode && !willScanRecordPodcastEpisode) {
		return null
	}
	// select the title aside and published player using the web's visibility rules
	const isLoaded = Boolean(podcastEpisode && player.podcastEpisode?.id === podcastEpisode.id)
	const isPublished = podcastEpisode?.status === "published" && isPublishedPodcastEpisode(podcastEpisode)
	return (
		<CollapsibleSection
			title={PODCAST_NAME}
			titleNote={<PodcastThemeSongNote />}
			titleAside={<PodcastEpisodeTitleAside podcastEpisode={podcastEpisode} isLoaded={isLoaded} />}
		>
			{isPublished && podcastEpisode ? (
				<PodcastEpisodePlayerCard
					podcastEpisode={podcastEpisode}
					podcastEpisodePath={podcastEpisode.pagePath ?? undefined}
					chapterTopicFeed={{
						topic,
						topicFeedHandlers,
						topicFindings: topic.findings,
						isRatable: topic.canRate,
						isBookmarkable: topic.isTopicOwner || topic.isTeamMember,
					}}
					onOpenPodcastFeedDialog={() => setIsFeedOpen(true)}
					feedButtonRef={feedButtonRef}
				/>
			) : (
				<UnpublishedPodcastEpisodeCard
					podcastEpisode={podcastEpisode}
					scanControl={isManualScanShown(topic) ? scanControl : undefined}
				/>
			)}
			{isFeedOpen && (
				<PodcastFeedDialog topic={topic} triggerRef={feedButtonRef} onClose={() => setIsFeedOpen(false)} />
			)}
		</CollapsibleSection>
	)
}

// keep the loaded controls and the unplayed label mutually exclusive
function PodcastEpisodeTitleAside({
	podcastEpisode,
	isLoaded,
}: {
	podcastEpisode: PodcastEpisode | null
	isLoaded: boolean
}) {
	if (isLoaded) {
		return <PodcastEpisodePlaybackPill />
	}
	const isUnplayed =
		podcastEpisode?.status === "published" && podcastEpisode.progressSeconds === 0 && !podcastEpisode.isCompleted
	return isUnplayed ? <Text className="text-sm font-bold text-link">new episode</Text> : null
}
