import { authClient } from "@carlnotes/client/authClient"
import { fetchPodcastEpisodePage, sendPodcastEpisodeHomeOrder } from "@carlnotes/client/podcastEpisodeClient"
import { isPublishedPodcastEpisode, toHomePodcastEpisodeLabel } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { isTopicSlugStale, toPodcastEpisodePath, toTopicPath } from "@carlnotes/contracts/seo"
import { toPodcastEpisodeTitleLabel } from "@carlnotes/core/lib/labels"
import { toPodcastEpisodeReportSubject, toPodcastEpisodeSocialProps } from "@carlnotes/core/lib/podcastEpisodeSocial"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { applyPodcastEpisodePageChanges, type TopicFindingChange } from "@carlnotes/core/lib/topicFindingChanges"
import { cn } from "@carlnotes/nightshift/classNames"
import { useMatch, useNavigate, useParams } from "@tanstack/react-router"
import { ListOrdered, Rss, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { type HomeOrderMove, HomeRankDialog } from "@/components/common/HomeRankDialog"
import { PodcastEpisodeChaptersTable } from "@/components/podcast/PodcastEpisodeChaptersTable"
import { PodcastEpisodeCountsLine } from "@/components/podcast/PodcastEpisodeCountsLine"
import { PodcastEpisodeHeader } from "@/components/podcast/PodcastEpisodeHeader"
import { PodcastEpisodePlayerCard } from "@/components/podcast/PodcastEpisodePlayerCard"
import { PodcastEpisodeSkeleton } from "@/components/podcast/PodcastEpisodeSkeleton"
import { PodcastEpisodesSection } from "@/components/podcast/PodcastEpisodesSection"
import { PodcastEpisodeTranscript } from "@/components/podcast/PodcastEpisodeTranscript"
import { PodcastFeedDialog } from "@/components/podcast/PodcastFeedDialog"
import { RemovePodcastEpisodeDialog } from "@/components/podcast/RemovePodcastEpisodeDialog"
import { ShareTopic } from "@/components/share/ShareTopic"
import { SocialSection } from "@/components/social/SocialSection"
import { isAddTopicToTeamShown } from "@/components/team/AddTopicToTeamButton"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { toAddTopicToTeamOption, toShareTopicOption } from "@/components/topic/TopicActions"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import { MENU_BUTTON_CLASS, NARROW_SCREEN_HIDDEN_CLASS, PAGE_CLASS } from "@/lib/styleClasses"
import { usePageTopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

/**
 * A podcast episode's own page at /topics/$topicId/$topicSlug/episodes/$season/$episodeNumber.
 */
export function PodcastEpisodePage() {
	const { topicId = "", topicSlug, season = "", episodeNumber = "" } = useParams({ strict: false })
	// the podcast episode page that the route loads on the server, or undefined after a browser navigation
	const loadedPodcastEpisodePage = useMatch({
		from: "/_layout/topics/$topicId_/$topicSlug_/episodes/$season/$episodeNumber",
		shouldThrow: false,
		select: (podcastEpisodeMatch) => podcastEpisodeMatch.loaderData?.podcastEpisodePage,
	})
	// the episode page payload. undefined while loading, and null if the episode is missing
	// or the user may not listen to the episode
	const [podcastEpisodePage, setPodcastEpisodePage] = useState<PodcastEpisodePageResponse | null | undefined>(
		loadedPodcastEpisodePage ?? undefined,
	)

	// whether the episode's topic is an invite topic the user may not see
	const [isTopicGated, setIsTopicGated] = useState(false)

	// the podcast feed dialog's open state, the actions menu's open dialog, and the New Topic button's dialog
	const [isPodcastFeedDialogOpen, setIsPodcastFeedDialogOpen] = useState(false)
	const [openDialog, setOpenDialog] = useState<PodcastEpisodeDialog | null>(null)
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()

	// load in the browser unless the server already loaded this podcast episode page and set the page title
	const loadPodcastEpisodePage = useCallback((): void => {
		fetchPodcastEpisodePage({ topicId, season, episodeNumber })
			.then((podcastEpisodePageResult) => {
				setPodcastEpisodePage(
					podcastEpisodePageResult.status === "visible" ? podcastEpisodePageResult.podcastEpisodePage : null,
				)
				setIsTopicGated(podcastEpisodePageResult.status === "gated")
			})
			.catch(() => {
				setPodcastEpisodePage(null)
				setIsTopicGated(false)
			})
	}, [topicId, season, episodeNumber])
	const pageId = `${topicId}/${season}/${episodeNumber}`
	useLoadInBrowser({ pageId, isLoadedOnServer: Boolean(loadedPodcastEpisodePage), loadPage: loadPodcastEpisodePage })
	usePageTitle(podcastEpisodePage?.podcastEpisode.title ?? null)

	// redirect a url with a stale slug to the podcast episode's current path once the url's podcast episode loads
	const navigate = useNavigate()
	useEffect(() => {
		if (!podcastEpisodePage) {
			return
		}
		const { topic, podcastEpisode } = podcastEpisodePage
		const isUrlPodcastEpisode = `${topic.id}/${podcastEpisode.season}/${podcastEpisode.episodeNumber}` === pageId
		if (isUrlPodcastEpisode && isTopicSlugStale(topic, topicSlug) && isPublishedPodcastEpisode(podcastEpisode)) {
			void navigate({ to: toPodcastEpisodePath(topic, podcastEpisode), replace: true })
		}
	}, [podcastEpisodePage, pageId, topicSlug, navigate])

	// read the session, and register the actions menu
	const { data: session } = authClient().useSession()
	useRegisterPodcastEpisodePageActions({
		podcastEpisodePage,
		isSignedIn: Boolean(session),
		onOpenDialog: setOpenDialog,
	})

	// the finding handlers, which reload the page after each action and keep a saved reaction on the page
	const changeTopicFinding = useCallback((change: TopicFindingChange): void => {
		setPodcastEpisodePage(
			(previousPodcastEpisodePage) =>
				previousPodcastEpisodePage && applyPodcastEpisodePageChanges(previousPodcastEpisodePage, [change]),
		)
	}, [])
	const topicFeedHandlers = usePageTopicFeedHandlers(loadPodcastEpisodePage, changeTopicFinding)

	// the loading skeleton, the topic's gate, or the line for an episode that did not load
	if (podcastEpisodePage === undefined) {
		return (
			<main className={PAGE_CLASS}>
				<PodcastEpisodeSkeleton />
			</main>
		)
	}
	if (podcastEpisodePage === null && isTopicGated) {
		return (
			<main className={PAGE_CLASS}>
				<PodcastEpisodeSkeleton />
				<TopicGateNotice
					isSignedIn={Boolean(session)}
					returnPath={`/topics/${topicId}/${topicSlug ?? "topic"}/episodes/${season}/${episodeNumber}`}
				/>
			</main>
		)
	}
	if (podcastEpisodePage === null) {
		return (
			<main className={PAGE_CLASS}>
				<p className="text-muted-foreground mt-6 text-sm">{"Carl couldn't find this episode. He checked both mugs."}</p>
			</main>
		)
	}

	// the podcast episode page's fields, the path of its topic's page, and what the chapters' topic finding notes read
	const { podcastEpisode, topic, topicFindings, canRate, transcript, topicPodcastEpisodes, relatedPodcastEpisodes } =
		podcastEpisodePage
	const topicPath = toTopicPath(topic)

	// send the rank dialog's moves one at a time, then reload the page. a rejection leaves the dialog open
	const handleRankPodcastEpisode = async (moves: HomeOrderMove[]): Promise<void> => {
		try {
			for (const move of moves) {
				await sendPodcastEpisodeHomeOrder(move.id, move.position)
			}
		} catch (error) {
			console.error("podcast episode home order failed", error)
			toast.error(SAVE_FAILED_TEXT)
			throw error
		}
		loadPodcastEpisodePage()
	}
	const chapterTopicFeed = { topicFindings, topic, isRatable: canRate, isBookmarkable: false, topicFeedHandlers }
	return (
		<main className={PAGE_CLASS}>
			{/* the Subscribe button on the left and the new topic button on the right */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<PodcastSubscribeButton onSubscribe={() => setIsPodcastFeedDialogOpen(true)} />
				<NewTopicButton onNewTopic={openNewTopicDialog} />
			</div>
			{/* the image beside the title and the description, which run under it once they pass its bottom, then the
			    topic's byline with the reactions, under the image on a phone */}
			<PodcastEpisodeHeader podcastEpisodePage={podcastEpisodePage} isSignedIn={Boolean(session)} />

			{/* the player card, whose Subscribe buttons the page's own button row replaces */}
			<PodcastEpisodePlayerCard podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />

			{/* the podcast episode's comment thread, where a comment may name a chapter and a chapter's tag plays from it */}
			<SocialSection {...toPodcastEpisodeSocialProps(podcastEpisodePage, Boolean(session))} />

			{/* the chapters table */}
			<CollapsibleSection value="chapters" title="Episode chapters" className={cn(NARROW_SCREEN_HIDDEN_CLASS, "mt-2")}>
				<PodcastEpisodeChaptersTable podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />
			</CollapsibleSection>

			{/* the transcript as text */}
			<section aria-labelledby="episode-transcript">
				<h2 id="episode-transcript" className="font-display py-2 text-lg">
					Episode transcript
				</h2>
				<PodcastEpisodeTranscript transcript={transcript} />
			</section>

			{/* the topic's other podcast episodes, then the nearest podcast episodes of other topics */}
			<PodcastEpisodesSection
				value="topic-episodes"
				title="Other episodes"
				titleColumnLabel="Episode"
				podcastEpisodes={topicPodcastEpisodes}
			/>
			<PodcastEpisodesSection
				value="related-episodes"
				title="Similar podcasts"
				titleColumnLabel="Podcast"
				podcastEpisodes={relatedPodcastEpisodes}
			/>
			{/* the podcast episode's listener count */}
			<PodcastEpisodeCountsLine podcastEpisodeId={podcastEpisode.id} isPublic={topic.visibility === "public"} />

			{/* the podcast feed dialog */}
			{isPodcastFeedDialogOpen && (
				<PodcastFeedDialog
					topic={{ id: topic.id, name: topic.name, visibility: topic.visibility }}
					onClose={() => setIsPodcastFeedDialogOpen(false)}
				/>
			)}
			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}
			{/* the actions menu's share dialog, Add topic to team dialog, and remove dialog.
			    a removed episode opens its topic's page */}
			{openDialog === "share" && <ShareTopic topic={topic} isDialog onClose={() => setOpenDialog(null)} />}
			{openDialog === "add-topic-to-team" && (
				<AddTopicToTeamDialog
					topic={topic}
					onTopicTeamsChanged={loadPodcastEpisodePage}
					onClose={() => setOpenDialog(null)}
				/>
			)}
			{openDialog === "rank" && podcastEpisodePage.homePodcastEpisodes && (
				<HomeRankDialog
					noun="podcasts"
					pageItem={{ id: podcastEpisode.id, label: toPodcastEpisodeTitleLabel(podcastEpisode) }}
					homeItems={podcastEpisodePage.homePodcastEpisodes.map((homePodcastEpisode) => ({
						id: homePodcastEpisode.id,
						label: toHomePodcastEpisodeLabel(homePodcastEpisode),
					}))}
					isPageItemOnHome={podcastEpisodePage.homeOrder !== null}
					onSave={handleRankPodcastEpisode}
					onClose={() => setOpenDialog(null)}
				/>
			)}
			{openDialog === "remove" && (
				<RemovePodcastEpisodeDialog
					podcastEpisode={podcastEpisode}
					onPodcastEpisodeRemoved={() => void navigate({ to: topicPath })}
					onClose={() => setOpenDialog(null)}
				/>
			)}
		</main>
	)
}

// the dialogs that the actions menu opens
type PodcastEpisodeDialog = "share" | "add-topic-to-team" | "rank" | "remove"

// the loaded page, whether the user is signed in, and the call that opens one of the menu's dialogs
type UseRegisterPodcastEpisodePageActionsOptions = {
	podcastEpisodePage: PodcastEpisodePageResponse | null | undefined
	isSignedIn: boolean
	onOpenDialog: (podcastEpisodeDialog: PodcastEpisodeDialog) => void
}

// register the actions menu for the podcast episode's topic, with Home podcasts for an admin on a public
// topic and Remove podcast episode for a user who may remove the podcast episode
function useRegisterPodcastEpisodePageActions({
	podcastEpisodePage,
	isSignedIn,
	onOpenDialog,
}: UseRegisterPodcastEpisodePageActionsOptions): void {
	const podcastEpisodeTopic = podcastEpisodePage?.topic
	useRegisterPageActions(
		podcastEpisodeTopic
			? {
					page: "Episode",
					options: [
						...(isAddTopicToTeamShown(podcastEpisodeTopic, isSignedIn)
							? [toAddTopicToTeamOption(() => onOpenDialog("add-topic-to-team"))]
							: []),
						toShareTopicOption(() => onOpenDialog("share")),
						...(podcastEpisodePage?.homePodcastEpisodes && podcastEpisodeTopic.visibility === "public"
							? [{ label: "Featured podcasts", Icon: ListOrdered, onSelect: () => onOpenDialog("rank") }]
							: []),
						...(podcastEpisodePage?.canRemovePodcastEpisode
							? [{ label: "Remove podcast episode", Icon: Trash2, onSelect: () => onOpenDialog("remove") }]
							: []),
					],
					report: toPodcastEpisodeReportSubject(podcastEpisodePage.podcastEpisode),
					hasNewTopicButton: true,
				}
			: null,
	)
}

// the button that opens the podcast feed dialog, at the left of the page's button row
function PodcastSubscribeButton({ onSubscribe }: { onSubscribe: () => void }) {
	return (
		<button type="button" onClick={onSubscribe} className={MENU_BUTTON_CLASS}>
			<Rss className="size-4" />
			Subscribe
		</button>
	)
}
