import { authClient } from "@carlnotes/client/authClient"
import { fetchPodcastEpisodePage } from "@carlnotes/client/podcastEpisodeClient"
import { isPublishedPodcastEpisode, type PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { FILM_ANCHOR_ID, PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { isTopicSlugStale, toPodcastEpisodePath, toTopicPath } from "@carlnotes/contracts/seo"
import { useTopicPodcastEpisodeVideoRenderingPoll } from "@carlnotes/core/hooks/useTopicPodcastEpisodeVideoRenderingPoll"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE } from "@carlnotes/core/lib/podcastEpisodeCopy"
import { toPodcastEpisodeSocialProps } from "@carlnotes/core/lib/podcastEpisodeSocial"
import { applyPodcastEpisodePageChanges, type TopicFindingChange } from "@carlnotes/core/lib/topicFindingChanges"
import { toTopicPodcastEpisodeVideoDisplay } from "@carlnotes/core/lib/topicPodcastEpisodeVideoDisplay"
import { cn } from "@carlnotes/nightshift/classNames"
import { useMatch, useNavigate, useParams } from "@tanstack/react-router"
import { Rss } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { PodcastEpisodeChaptersTable } from "@/components/podcast/PodcastEpisodeChaptersTable"
import { PodcastEpisodeCountsLine } from "@/components/podcast/PodcastEpisodeCountsLine"
import { type PodcastEpisodeDialog, PodcastEpisodeDialogs } from "@/components/podcast/PodcastEpisodeDialogs"
import { PodcastEpisodeHeader } from "@/components/podcast/PodcastEpisodeHeader"
import { PodcastEpisodePlayerCard } from "@/components/podcast/PodcastEpisodePlayerCard"
import { PodcastEpisodeSkeleton } from "@/components/podcast/PodcastEpisodeSkeleton"
import { PodcastEpisodesSection } from "@/components/podcast/PodcastEpisodesSection"
import { PodcastEpisodeTranscript } from "@/components/podcast/PodcastEpisodeTranscript"
import { PodcastFeedDialog } from "@/components/podcast/PodcastFeedDialog"
import { PodcastThemeSongNote } from "@/components/podcast/PodcastThemeSongNote"
import { useRegisterPodcastEpisodePageActions } from "@/components/podcast/podcastEpisodeActions"
import { TopicPodcastEpisodeVideoPlayer } from "@/components/podcast/TopicPodcastEpisodeVideoPlayer"
import { UnpublishedPodcastEpisodeCard } from "@/components/podcast/UnpublishedPodcastEpisodeCard"
import { SocialSection } from "@/components/social/SocialSection"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import {
	NARROW_SCREEN_HIDDEN_CLASS,
	PAGE_BUTTON_ROW_CLASS,
	PAGE_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
} from "@/lib/styleClasses"
import { usePageTopicFeedHandlers } from "@/providers/TopicFeedProvider"

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

	// read the page again while the film renders. the read replaces the shown podcast episode's page once its film is
	// no longer rendering, and a failed read keeps the page
	const pollPodcastEpisodePage = useCallback(async (): Promise<void> => {
		const podcastEpisodePageResult = await fetchPodcastEpisodePage({ topicId, season, episodeNumber })
		if (podcastEpisodePageResult.status !== "visible") {
			return
		}
		const { podcastEpisodePage: polledPodcastEpisodePage } = podcastEpisodePageResult
		setPodcastEpisodePage((shownPodcastEpisodePage) => {
			const isShownPodcastEpisode =
				shownPodcastEpisodePage?.podcastEpisode.id === polledPodcastEpisodePage.podcastEpisode.id
			const isVideoRendering = Boolean(polledPodcastEpisodePage.podcastEpisode.isVideoRendering)
			return isShownPodcastEpisode && !isVideoRendering ? polledPodcastEpisodePage : shownPodcastEpisodePage
		})
	}, [topicId, season, episodeNumber])
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
	const chapterTopicFeed = { topicFindings, topic, isRatable: canRate, isBookmarkable: false, topicFeedHandlers }
	return (
		<main className={PAGE_CLASS}>
			{/* the Subscribe button on the left and the new topic button on the right */}
			<div className={PAGE_BUTTON_ROW_CLASS}>
				<PodcastSubscribeButton onSubscribe={() => setIsPodcastFeedDialogOpen(true)} />
				<NewTopicButton onNewTopic={openNewTopicDialog} />
			</div>
			{/* the image beside the title and the description, which run under it once they pass its bottom, then the
			    topic's byline with the reactions, under the image on a phone */}
			<PodcastEpisodeHeader
				podcastEpisodePage={podcastEpisodePage}
				isSignedIn={Boolean(session)}
				onEditImage={() => setOpenDialog("edit-image")}
			/>

			{/* the podcast's section, with the theme song's credits right after its title: the player card, whose
			    Subscribe buttons the page's own button row replaces */}
			<CollapsibleSection
				value="podcast"
				title={PODCAST_NAME}
				titleNote={<PodcastThemeSongNote />}
				hasClosedDivider
				className="mt-2"
			>
				<PodcastEpisodePlayerCard podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />
			</CollapsibleSection>

			{/* the film's section, under the podcast's, for a podcast episode with a film: the film player in its card, or
			    the card that says the film is rendering */}
			<TopicPodcastEpisodeVideoPageSection
				podcastEpisode={podcastEpisode}
				onVideoRenderingPoll={pollPodcastEpisodePage}
			/>

			{/* the podcast episode's comment thread, where a comment may name a chapter and a chapter's tag plays from it */}
			<SocialSection {...toPodcastEpisodeSocialProps(podcastEpisodePage, Boolean(session))} hasClosedDivider />

			{/* the chapters table */}
			<CollapsibleSection
				value="chapters"
				title="Episode chapters"
				countLabel={toSectionCountLabel(podcastEpisode.chapters.length, "chapter")}
				hasClosedDivider
				className={cn(NARROW_SCREEN_HIDDEN_CLASS, "mt-2")}
			>
				<PodcastEpisodeChaptersTable podcastEpisode={podcastEpisode} chapterTopicFeed={chapterTopicFeed} />
			</CollapsibleSection>

			{/* the transcript as text */}
			<section aria-labelledby="episode-transcript">
				<h2 id="episode-transcript" className="font-display py-2 text-xl">
					Episode transcript
				</h2>
				<PodcastEpisodeTranscript transcript={transcript} />
			</section>

			{/* the topic's other podcast episodes, then the nearest podcast episodes of other topics. the page's last section
			    has no divider under it */}
			<PodcastEpisodesSection
				value="topic-episodes"
				title="Other episodes"
				hasClosedDivider={relatedPodcastEpisodes.length > 0}
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
			{/* the actions menu's dialogs and the header image's dialog */}
			<PodcastEpisodeDialogs
				podcastEpisodePage={podcastEpisodePage}
				openDialog={openDialog}
				onOpenDialog={setOpenDialog}
				onPodcastEpisodePageChanged={loadPodcastEpisodePage}
				onPodcastEpisodeRemoved={() => void navigate({ to: topicPath })}
			/>
		</main>
	)
}

// the podcast episode, and the read of its page again while its film renders
type TopicPodcastEpisodeVideoPageSectionProps = {
	podcastEpisode: PodcastEpisode
	onVideoRenderingPoll: () => Promise<void>
}

// the film's collapsible section at the film anchor, for a podcast episode with a film, with the theme song's credits
// right after its title. it holds the film player in its card, which stays mounted while the section is closed, or the
// card that says the film is rendering, and the page is read again until the film is ready
function TopicPodcastEpisodeVideoPageSection({
	podcastEpisode,
	onVideoRenderingPoll,
}: TopicPodcastEpisodeVideoPageSectionProps) {
	// read the page again while the film renders
	const topicPodcastEpisodeVideoDisplay = toTopicPodcastEpisodeVideoDisplay(podcastEpisode)
	const isVideoRendering = topicPodcastEpisodeVideoDisplay === "rendering"
	useTopicPodcastEpisodeVideoRenderingPoll({ isVideoRendering, onPoll: onVideoRenderingPoll })
	if (!topicPodcastEpisodeVideoDisplay) {
		return null
	}
	return (
		<div id={FILM_ANCHOR_ID} className="scroll-mt-20">
			<CollapsibleSection
				value="topic-podcast-episode-video"
				title={TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE}
				titleNote={<PodcastThemeSongNote />}
				isContentKept
				hasClosedDivider
				className="mt-2"
			>
				{isVideoRendering ? (
					<UnpublishedPodcastEpisodeCard podcastEpisode={podcastEpisode} isVideoRendering />
				) : (
					<TopicPodcastEpisodeVideoPlayer podcastEpisode={podcastEpisode} isCard />
				)}
			</CollapsibleSection>
		</div>
	)
}

// the button that opens the podcast feed dialog, at the left of the page's button row
function PodcastSubscribeButton({ onSubscribe }: { onSubscribe: () => void }) {
	return (
		<button type="button" onClick={onSubscribe} className={PLAIN_PAGE_BUTTON_CLASS}>
			<Rss className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
			Subscribe
		</button>
	)
}
