import { authClient } from "@carlnotes/client/authClient"
import { fetchPodcastEpisodePage } from "@carlnotes/client/podcastEpisodeClient"
import { fetchPodcastEpisodeCounts } from "@carlnotes/client/viewerCountsClient"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { FILM_ANCHOR_ID, PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { usePolledCounts } from "@carlnotes/core/hooks/usePolledCounts"
import { useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { useTopicPodcastEpisodeVideoRenderingPoll } from "@carlnotes/core/hooks/useTopicPodcastEpisodeVideoRenderingPoll"
import { toPodcastEpisodeTitleLabel, toSectionCountLabel } from "@carlnotes/core/lib/labels"
import {
	PODCAST_EPISODE_LOAD_FAILED_TEXT,
	TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE,
} from "@carlnotes/core/lib/podcastEpisodeCopy"
import {
	EDIT_PODCAST_EPISODE_LABEL,
	isTopicPodcastEpisodeVideoEditShown,
	toPodcastEpisodeEditableImage,
	toTopicPodcastEpisodeVideoEditableImage,
} from "@carlnotes/core/lib/podcastEpisodeEditor"
import {
	isPodcastEpisodeProfileOrderShown,
	isTopicPodcastEpisodeVideoProfileOrderShown,
} from "@carlnotes/core/lib/podcastEpisodeHomeOrder"
import { toPodcastEpisodeReportSubject, toPodcastEpisodeSocialProps } from "@carlnotes/core/lib/podcastEpisodeSocial"
import { PROFILE_RANK_OPTION_LABELS } from "@carlnotes/core/lib/rankDialog"
import { isAddTopicToTeamShown } from "@carlnotes/core/lib/topicActions"
import { applyPodcastEpisodePageChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { toTopicPodcastEpisodeVideoDisplay } from "@carlnotes/core/lib/topicPodcastEpisodeVideoDisplay"
import { useQuery } from "@tanstack/react-query"
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { ListOrdered, Pencil, Trash2 } from "lucide-react-native"
import { type ComponentRef, useCallback, useRef, useState } from "react"
import { View } from "react-native"
import { ProfileRankDialog } from "@/components/common/RankDialog"
import { PageScreen } from "@/components/layout/PageScreen"
import { SectionAnchor } from "@/components/layout/SectionAnchor"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import type { PageActionOption } from "@/components/search/PageActionMenu"
import {
	toAddTopicToTeamOption,
	toEditTopicPodcastEpisodeVideoOption,
	toShareTopicOption,
} from "@/components/search/pageActionOptions"
import { ShareTopicSheet } from "@/components/share/ShareTopic"
import { SocialSection } from "@/components/social/SocialSection"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { EditImageDialog } from "@/components/topic/EditImageDialog"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { EditPodcastEpisodeDialog } from "./EditPodcastEpisodeDialog"
import { PodcastEpisodeChaptersTable } from "./PodcastEpisodeChaptersTable"
import { PodcastEpisodeCountsLine } from "./PodcastEpisodeCountsLine"
import { PodcastEpisodeHeader } from "./PodcastEpisodeHeader"
import { PodcastEpisodePlayerCard } from "./PodcastEpisodePlayerCard"
import { PodcastEpisodeSkeleton } from "./PodcastEpisodeSkeleton"
import { PodcastEpisodesSection } from "./PodcastEpisodesSection"
import { PodcastEpisodeTranscript } from "./PodcastEpisodeTranscript"
import { PodcastFeedDialog } from "./PodcastFeedDialog"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { RemovePodcastEpisodeDialog } from "./RemovePodcastEpisodeDialog"
import { TopicPodcastEpisodeVideoPlayer } from "./TopicPodcastEpisodeVideoPlayer"
import { UnpublishedPodcastEpisodeCard } from "./UnpublishedPodcastEpisodeCard"

type PodcastEpisodeDialog =
	| "feed"
	| "share"
	| "team"
	| "edit"
	| "edit-film"
	| "edit-image"
	| "rank-profile"
	| "rank-profile-films"
	| "remove"
	| null

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
	const [dialog, setDialog] = useState<PodcastEpisodeDialog>(null)
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
	const options = toPodcastEpisodeActionOptions({ page, isSignedIn, onOpenDialog: setDialog })

	// read the page again while the film renders
	const topicPodcastEpisodeVideoDisplay = toTopicPodcastEpisodeVideoDisplay(podcastEpisode)
	const isVideoRendering = topicPodcastEpisodeVideoDisplay === "rendering"
	useTopicPodcastEpisodeVideoRenderingPoll({ isVideoRendering, onPoll: onReload })
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
					onEditImage={() => setDialog("edit-image")}
				/>
			}
			contentClassName="mt-5 gap-2"
		>
			{/* the podcast's section, with the theme song's credits right after its title and the player card */}
			<CollapsibleSection title={PODCAST_NAME} titleNote={<PodcastThemeSongNote />} hasClosedDivider>
				<PodcastEpisodePlayerCard podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />
			</CollapsibleSection>
			{/* the film's section, under the podcast's, which a link opens the screen at with ?section=film, with the theme
			    song's credits right after its title: the film player in its card, which stays mounted while the section
			    is closed, or the card that says the film is rendering */}
			{topicPodcastEpisodeVideoDisplay && (
				<SectionAnchor name={FILM_ANCHOR_ID}>
					<CollapsibleSection
						title={TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE}
						titleNote={<PodcastThemeSongNote />}
						isContentKept
						hasClosedDivider
					>
						{isVideoRendering ? (
							<UnpublishedPodcastEpisodeCard podcastEpisode={podcastEpisode} isVideoRendering />
						) : (
							<TopicPodcastEpisodeVideoPlayer podcastEpisode={podcastEpisode} isCard />
						)}
					</CollapsibleSection>
				</SectionAnchor>
			)}
			{/* the podcast episode's comment thread, where a comment may name a chapter and a chapter's tag plays from it */}
			<SocialSection {...toPodcastEpisodeSocialProps(page, isSignedIn)} hasClosedDivider />
			{/* wide-screen chapters */}
			<View className="hidden sm:flex">
				<CollapsibleSection
					title="Episode chapters"
					countLabel={toSectionCountLabel(podcastEpisode.chapters.length, "chapter")}
				>
					<PodcastEpisodeChaptersTable podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />
				</CollapsibleSection>
			</View>
			{/* transcript */}
			<View>
				<Text accessibilityRole="header" style={toTypeRoleStyle("sectionTitle")} className="py-2">
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
			{dialog === "edit" && (
				<EditPodcastEpisodeDialog
					podcastEpisodePage={page}
					onPodcastEpisodeChanged={onReload}
					onClose={() => setDialog(null)}
				/>
			)}
			{/* the header image's sheet, or the film's image sheet that the action menu's Edit film opens */}
			{(dialog === "edit-image" || dialog === "edit-film") && (
				<EditImageDialog
					editableImage={
						dialog === "edit-film" ? toTopicPodcastEpisodeVideoEditableImage(page) : toPodcastEpisodeEditableImage(page)
					}
					onImageChanged={onReload}
					onClose={() => setDialog(null)}
				/>
			)}
			{(dialog === "rank-profile" || dialog === "rank-profile-films") && (
				<ProfileRankDialog
					rankedNoun={dialog === "rank-profile-films" ? "films" : "podcasts"}
					pageItem={{ id: podcastEpisode.id, label: toPodcastEpisodeTitleLabel(podcastEpisode) }}
					onClose={() => setDialog(null)}
				/>
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

// the loaded page, whether the user is signed in, and the call that opens one of the menu's sheets
type ToPodcastEpisodeActionOptionsOptions = {
	page: PodcastEpisodePageResponse
	isSignedIn: boolean
	onOpenDialog: (podcastEpisodeDialog: PodcastEpisodeDialog) => void
}

// the action menu's options in the web's order: Add topic to team, Share topic, Edit film right above Edit podcast for
// a user who may edit the podcast episode, Featured films right above Featured podcasts for a public topic's owner,
// and Remove episode for a user who may remove it
function toPodcastEpisodeActionOptions({
	page,
	isSignedIn,
	onOpenDialog,
}: ToPodcastEpisodeActionOptionsOptions): PageActionOption[] {
	return [
		...(isAddTopicToTeamShown(page.topic, isSignedIn) ? [toAddTopicToTeamOption(() => onOpenDialog("team"))] : []),
		toShareTopicOption(() => onOpenDialog("share")),
		...(isTopicPodcastEpisodeVideoEditShown(page)
			? [toEditTopicPodcastEpisodeVideoOption(() => onOpenDialog("edit-film"))]
			: []),
		...(page.canEditPodcastEpisode
			? [{ label: EDIT_PODCAST_EPISODE_LABEL, icon: Pencil, onSelect: () => onOpenDialog("edit") }]
			: []),
		...(isTopicPodcastEpisodeVideoProfileOrderShown(page)
			? [toProfileRankOption("films", () => onOpenDialog("rank-profile-films"))]
			: []),
		...(isPodcastEpisodeProfileOrderShown(page)
			? [toProfileRankOption("podcasts", () => onOpenDialog("rank-profile"))]
			: []),
		...(page.canRemovePodcastEpisode
			? [{ label: "Remove episode", icon: Trash2, onSelect: () => onOpenDialog("remove") }]
			: []),
	]
}

// the option that opens the owner's profile pins for the films or the podcast episodes
function toProfileRankOption(rankedNoun: "films" | "podcasts", onSelect: () => void): PageActionOption {
	return { label: PROFILE_RANK_OPTION_LABELS[rankedNoun], icon: ListOrdered, onSelect }
}
