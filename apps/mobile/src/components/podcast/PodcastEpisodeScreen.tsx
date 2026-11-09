import { authClient } from "@carlnotes/client/authClient"
import { fetchPodcastEpisodePage } from "@carlnotes/client/podcastEpisodeClient"
import { fetchPodcastEpisodeCounts } from "@carlnotes/client/viewerCountsClient"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { usePolledCounts } from "@carlnotes/core/hooks/usePolledCounts"
import { useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { PODCAST_EPISODE_LOAD_FAILED_TEXT } from "@carlnotes/core/lib/podcastEpisodeCopy"
import { toPodcastEpisodeReportSubject, toPodcastEpisodeSocialProps } from "@carlnotes/core/lib/podcastEpisodeSocial"
import { isAddTopicToTeamShown } from "@carlnotes/core/lib/topicActions"
import { applyPodcastEpisodePageChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { useQuery } from "@tanstack/react-query"
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { Rss, Share as ShareIcon, Trash2, Users } from "lucide-react-native"
import { type ComponentRef, type RefObject, useCallback, useRef, useState } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { PageScreen } from "@/components/layout/PageScreen"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicImage } from "@/components/primitives/topic-image"
import type { PageActionOption } from "@/components/search/PageActionMenu"
import { ShareTopicSheet } from "@/components/share/ShareTopic"
import { ReactionRow } from "@/components/social/ReactionRow"
import { SocialSection } from "@/components/social/SocialSection"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { TopicByline } from "@/components/topic/TopicByline"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import { HEADER_TOPIC_IMAGE_CLASS } from "@/topicImageClasses"
import { PodcastEpisodeChaptersTable } from "./PodcastEpisodeChaptersTable"
import { PodcastEpisodeCountsLine } from "./PodcastEpisodeCountsLine"
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
					<Text className="text-sm text-muted-foreground">{PODCAST_EPISODE_LOAD_FAILED_TEXT}</Text>
					<Button accessibilityLabel="Retry podcast episode" onPress={() => void refetch()}>
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
		topicFindings: applyPodcastEpisodePageChanges(page, actions.pendingChanges).topicFindings,
		isRatable: page.canRate,
		isBookmarkable: false,
		topicFeedHandlers: actions.handlers,
	}
	const options: PageActionOption[] = [
		...(isAddTopicToTeamShown(topic, isSignedIn)
			? [{ label: "Add topic to team", icon: Users, onSelect: () => setDialog("team") }]
			: []),
		{ label: "Share topic", icon: ShareIcon, onSelect: () => setDialog("share") },
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
			report={toPodcastEpisodeReportSubject(podcastEpisode)}
			header={
				<PodcastEpisodeHeader
					page={page}
					isSignedIn={isSignedIn}
					feedButtonRef={feedButtonRef}
					onSubscribe={() => setDialog("feed")}
				/>
			}
			contentClassName="mt-5 gap-2"
		>
			{/* player */}
			<PodcastEpisodePlayerCard podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />
			{/* the podcast episode's comment thread, where a comment may name a chapter and a chapter's tag plays from it */}
			<SocialSection {...toPodcastEpisodeSocialProps(page, isSignedIn)} />
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
function PodcastEpisodeHeader({
	page: { podcastEpisode, topic, reactions },
	isSignedIn,
	feedButtonRef,
	onSubscribe,
}: {
	page: PodcastEpisodePageResponse
	isSignedIn: boolean
	// the Subscribe button, which the feed dialog returns focus to, and what opens the dialog
	feedButtonRef: RefObject<ComponentRef<typeof View> | null>
	onSubscribe: () => void
}) {
	return (
		<View className="mt-3">
			{/* the Subscribe button on the left and the new topic button on the right */}
			<View className="flex-row items-start justify-between gap-3">
				<Button ref={feedButtonRef} variant="outline" accessibilityLabel="Subscribe" onPress={onSubscribe}>
					<Icon as={Rss} className="size-4" />
					<Text>Subscribe</Text>
				</Button>
				<NewTopicButton />
			</View>
			{/* the podcast episode's own image beside the title, the description, and the byline. React Native has no
			    float, so the text stays beside the image instead of running under it as on the web */}
			<View className="mt-4 flex-row items-start gap-4">
				<TopicImage
					image={podcastEpisode.image}
					size="page"
					name={podcastEpisode.title ?? topic.name}
					className={HEADER_TOPIC_IMAGE_CLASS}
				/>
				<View className="min-w-0 flex-1">
					{/* the title. the heading and credits stay separate screen-reader controls */}
					<View className="min-w-0 flex-row items-end">
						<Text accessibilityRole="header" className="min-w-0 flex-1 font-display text-2xl leading-tight">
							{podcastEpisode.title}
						</Text>
						<PodcastThemeSongNote />
					</View>
					{podcastEpisode.description && <Text className="mt-1.5 text-sm">{podcastEpisode.description}</Text>}
					{/* the byline, the topic's name, and the podcast episode's reactions on one line */}
					<View className="mt-1.5 flex-row flex-wrap items-center gap-x-3">
						<View className="min-w-0 shrink flex-row flex-wrap items-center gap-x-1">
							<TopicByline topic={topic} label="Recorded by" isPage />
							<Text className="text-sm text-muted-foreground">
								{topic.teamLink || topic.owner ? "for " : "Coffee Break podcast for "}
								<AnchorLink asChild href={toTopicPath(topic)} accessibilityLabel={`Open ${topic.name}`}>
									<Text className="text-sm text-link">{topic.name}</Text>
								</AnchorLink>
							</Text>
						</View>
						<ReactionRow
							target={{ kind: "podcastEpisode", id: podcastEpisode.id }}
							summary={reactions}
							isSignedIn={isSignedIn}
						/>
					</View>
				</View>
			</View>
		</View>
	)
}

/**
 * Reserves the phone episode page's title, player, and transcript while its permission-aware payload loads.
 */
function PodcastEpisodeSkeleton() {
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
