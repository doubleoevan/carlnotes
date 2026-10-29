import { authClient } from "@carlnotes/client/authClient"
import { fetchPodcastEpisodePage } from "@carlnotes/client/podcastEpisodeClient"
import { fetchPodcastEpisodeCounts } from "@carlnotes/client/viewerCountsClient"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { usePolledCounts } from "@carlnotes/core/hooks/usePolledCounts"
import { useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { isAddTopicToTeamShown } from "@carlnotes/core/lib/topicActions"
import { applyFindingChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { useQuery } from "@tanstack/react-query"
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { Share2, Trash2, Users } from "lucide-react-native"
import { type ComponentRef, useCallback, useRef, useState } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { PageScreen } from "@/components/layout/PageScreen"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import type { PageActionOption } from "@/components/search/PageActionMenu"
import { ShareTopicSheet } from "@/components/share/ShareTopic"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { TopicByline } from "@/components/topic/Topic"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import { PodcastEpisodeChaptersTable } from "./PodcastEpisodeChaptersTable"
import { PodcastEpisodeCountsLine } from "./PodcastEpisodeCountsLine"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"
import { PodcastEpisodePlayerCard } from "./PodcastEpisodePlayerCard"
import { PodcastEpisodesSection } from "./PodcastEpisodesSection"
import { PodcastEpisodeTranscript } from "./PodcastEpisodeTranscript"
import { PodcastFeedDialog } from "./PodcastFeedDialog"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { RemovePodcastEpisodeDialog } from "./RemovePodcastEpisodeDialog"

type EpisodeDialog = "feed" | "share" | "team" | "remove" | null

/**
 * Reads the existing episode-page payload and presents its player, transcript, related episodes, and permitted actions.
 */
export function PodcastEpisodeScreen() {
	// scope every protected page to its account and route identity
	const { topicId, season, episodeNumber } = useLocalSearchParams<{
		topicId: string
		season: string
		episodeNumber: string
	}>()
	const { data: session } = authClient().useSession()
	const query = useQuery({
		queryKey: ["podcast-episode-page", session?.user.id ?? null, topicId, season, episodeNumber],
		queryFn: ({ signal }) =>
			fetchPodcastEpisodePage({ topicId, season, episodeNumber }, { shouldThrowOnError: true, signal }),
		gcTime: 0,
		staleTime: 0,
		retry: false,
	})
	const { refetch } = query
	useFocusEffect(
		useCallback(() => {
			void refetch()
		}, [refetch]),
	)
	const page = query.data?.status === "visible" ? query.data.podcastEpisodePage : null
	if (page) {
		return (
			<EpisodeContent
				key={`${session?.user.id ?? "visitor"}/${page.podcastEpisode.id}`}
				page={page}
				isSignedIn={Boolean(session)}
				userId={session?.user.id ?? null}
				onReload={() => {
					void refetch()
				}}
			/>
		)
	}
	return (
		<PageScreen title="Coffee Break" contentClassName="mt-0 gap-4" header={<View />}>
			{/* loading */}
			{query.isPending && <PodcastEpisodeSkeleton />}
			{/* retryable error */}
			{query.isError && (
				<>
					<Text className="text-sm text-muted-foreground">This episode could not load. Try again.</Text>
					<Button accessibilityLabel="Retry episode" onPress={() => void refetch()}>
						<Text>Try again</Text>
					</Button>
				</>
			)}
			{/* topic access gate */}
			{query.data?.status === "gated" && (
				<TopicGateNotice
					isSignedIn={Boolean(session)}
					returnPath={`/topics/${topicId}/episodes/${season}/${episodeNumber}`}
				/>
			)}
			{/* missing episode */}
			{query.data?.status === "missing" && (
				<Text className="mt-6 text-sm text-muted-foreground">
					{"Carl couldn't find this episode. He checked both mugs."}
				</Text>
			)}
		</PageScreen>
	)
}

// preserve the web page's header and narrow-screen section order
function EpisodeContent({
	page,
	isSignedIn,
	userId,
	onReload,
}: {
	page: PodcastEpisodePageResponse
	isSignedIn: boolean
	userId: string | null
	onReload: () => void
}) {
	const [dialog, setDialog] = useState<EpisodeDialog>(null)
	const feedButtonRef = useRef<ComponentRef<typeof View>>(null)
	const { podcastEpisode, topic } = page
	const actions = useTopicFindingActions({ userId, shouldUpdateOptimistically: true, onChangeConfirmed: onReload })
	// the listener count, every minute while this episode is the active route, kept through a failed read
	const pathname = usePathname()
	const readPodcastEpisodeCounts = useCallback(
		(signal: AbortSignal) => fetchPodcastEpisodeCounts(podcastEpisode.id, topic.visibility === "public", signal),
		[podcastEpisode.id, topic.visibility],
	)
	const counts = usePolledCounts(
		readPodcastEpisodeCounts,
		pathname === `/topics/${topic.id}/episodes/${podcastEpisode.season}/${podcastEpisode.episodeNumber}`,
	)
	const chapterTopicFeed = {
		topic,
		topicFindings: page.topicFindings.map((finding) => applyFindingChanges(finding, actions.pendingChanges)),
		isRatable: page.canRate,
		isBookmarkable: false,
		topicFeedHandlers: actions.handlers,
	}
	const options: PageActionOption[] = [
		...(isAddTopicToTeamShown(topic, isSignedIn)
			? [{ label: "Add topic to team", icon: Users, onSelect: () => setDialog("team") }]
			: []),
		{ label: "Share topic", icon: Share2, onSelect: () => setDialog("share") },
		...(page.canRemovePodcastEpisode
			? [{ label: "Remove episode", icon: Trash2, onSelect: () => setDialog("remove") }]
			: []),
	]
	return (
		<PageScreen
			title="Episode"
			onRefresh={onReload}
			hasNewTopicButton
			options={options}
			report={{ subjectKind: "topic", subjectId: topic.id, subjectLabel: topic.name }}
			header={<EpisodeHeader page={page} />}
			contentClassName="mt-5 gap-2"
		>
			{/* player */}
			<PodcastEpisodePlayerCard
				podcastEpisode={podcastEpisode}
				chapterTopicFeed={chapterTopicFeed}
				onOpenPodcastFeedDialog={() => setDialog("feed")}
				feedButtonRef={feedButtonRef}
			/>
			{/* wide-screen chapters */}
			<View className="hidden sm:flex">
				<CollapsibleSection title="Episode chapters">
					<PodcastEpisodeChaptersTable podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />
				</CollapsibleSection>
			</View>
			{/* transcript */}
			<View>
				<Text accessibilityRole="header" className="py-2 font-display text-lg">
					Episode transcript
				</Text>
				<PodcastEpisodeTranscript transcript={page.transcript} />
			</View>
			{/* related episodes */}
			<PodcastEpisodesSection
				title="Other episodes"
				titleColumnLabel="Episode"
				podcastEpisodes={page.topicPodcastEpisodes}
			/>
			<PodcastEpisodesSection
				title="Similar podcasts"
				titleColumnLabel="Podcast"
				podcastEpisodes={page.relatedPodcastEpisodes}
			/>
			{/* listener count */}
			<PodcastEpisodeCountsLine listenerCount={counts?.listenerCount} />
			{/* action sheets */}
			{dialog === "feed" && (
				<PodcastFeedDialog topic={topic} triggerRef={feedButtonRef} onClose={() => setDialog(null)} />
			)}
			{dialog === "share" && <ShareTopicSheet topic={topic} onClose={() => setDialog(null)} />}
			{dialog === "team" && (
				<AddTopicToTeamDialog topic={topic} onTopicTeamsChanged={onReload} onClose={() => setDialog(null)} />
			)}
			{dialog === "remove" && (
				<RemovePodcastEpisodeDialog
					podcastEpisode={podcastEpisode}
					onClose={() => setDialog(null)}
					onPodcastEpisodeRemoved={() => router.replace(`/topics/${topic.id}`)}
				/>
			)}
		</PageScreen>
	)
}

// hide the duplicate cover and chapter table at phone width, as the web does
function EpisodeHeader({ page: { podcastEpisode, topic } }: { page: PodcastEpisodePageResponse }) {
	return (
		<View className="mt-3 flex-row items-start gap-4">
			<PodcastEpisodeCover
				podcastEpisode={podcastEpisode}
				className="hidden size-36 border border-separator shadow-raised sm:flex"
			/>
			<View className="min-w-0 flex-1">
				<View className="flex-row items-start justify-between gap-3">
					<Text className="min-w-0 flex-1 text-sm text-muted-foreground">
						{"Coffee Break podcast · "}
						<AnchorLink asChild href={toTopicPath(topic)} accessibilityLabel={`Open ${topic.name}`}>
							<Text className="text-sm text-link">{topic.name}</Text>
						</AnchorLink>
					</Text>
					<NewTopicButton />
				</View>
				{/* expose the heading and credits as separate screen-reader controls */}
				<View className="mt-1.5 flex-row items-end">
					<Text accessibilityRole="header" className="min-w-0 flex-1 font-display text-2xl leading-tight">
						{podcastEpisode.title}
					</Text>
					<PodcastThemeSongNote />
				</View>
				{podcastEpisode.description && <Text className="mt-1.5 text-sm">{podcastEpisode.description}</Text>}
				<View className="mt-1.5 sm:hidden">
					<TopicByline topic={topic} isPage />
				</View>
			</View>
		</View>
	)
}

/**
 * Reserves the phone episode page's title, player, and transcript while its permission-aware payload loads.
 */
export function PodcastEpisodeSkeleton() {
	return (
		<View accessible accessibilityLabel="Loading episode" accessibilityState={{ busy: true }}>
			<SkeletonPulse>
				<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="gap-5">
					<View className="h-8 w-5/6 rounded bg-muted" />
					<View className="h-4 w-3/4 rounded bg-muted" />
					<View className="h-80 rounded-lg border border-separator bg-card p-5">
						<View className="size-14 rounded-full bg-muted" />
					</View>
					<View className="h-7 w-40 rounded bg-muted" />
					<View className="h-80 rounded-lg border border-separator bg-card" />
				</View>
			</SkeletonPulse>
		</View>
	)
}
