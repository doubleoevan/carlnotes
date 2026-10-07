import type { PodcastEpisodePageResponse, PodcastEpisodeTranscriptBlock } from "@shared/contracts"
import { isTopicSlugStale, toPodcastEpisodePath, toTopicPath } from "@shared/seo"
import { useMatch, useNavigate, useParams } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { authClient } from "@/clients/authClient"
import { fetchPodcastEpisodePage } from "@/clients/podcastEpisodeClient"
import type { GatedTopicVisibility } from "@/clients/topicClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeChaptersTable } from "@/components/podcast/PodcastEpisodeChaptersTable"
import { PodcastEpisodeCover } from "@/components/podcast/PodcastEpisodeCover"
import { PodcastEpisodePlayerCard } from "@/components/podcast/PodcastEpisodePlayerCard"
import { PodcastFeedDialog } from "@/components/podcast/PodcastFeedDialog"
import { RemovePodcastEpisodeDialog } from "@/components/podcast/RemovePodcastEpisodeDialog"
import { ThemeSongNote } from "@/components/podcast/ThemeSongNote"
import { ShareTopic } from "@/components/share/ShareTopic"
import { TableCard } from "@/components/table/TableCard"
import { isAddTopicToTeamShown } from "@/components/team/AddTopicToTeamButton"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { MoreButton } from "@/components/topic/MoreButton"
import { TopicByline } from "@/components/topic/Topic"
import { toAddTopicToTeamOption, toShareTopicOption } from "@/components/topic/TopicActions"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import {
	CollapsibleSectionSkeleton,
	ExpanderSkeleton,
	PodcastEpisodePlayerCardSkeleton,
} from "@/components/topic/TopicSkeleton"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import {
	COVER_PLACEHOLDER_CLASS,
	HIGHLIGHT_SCROLLBAR_CLASS,
	INFO_CARD_CLASS,
	PAGE_CLASS,
	SCRIPTED_ONLY_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
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

	// the visibility of the episode's invite or private topic if the user may not see the topic, or null
	const [gatedVisibility, setGatedVisibility] = useState<GatedTopicVisibility | null>(null)

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
				setGatedVisibility(
					podcastEpisodePageResult.status === "gated" ? podcastEpisodePageResult.topicGate.visibility : null,
				)
			})
			.catch(() => {
				setPodcastEpisodePage(null)
				setGatedVisibility(null)
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
		if (isUrlPodcastEpisode && isTopicSlugStale(topic, topicSlug)) {
			void navigate({ to: toPodcastEpisodePath(topic, podcastEpisode), replace: true })
		}
	}, [podcastEpisodePage, pageId, topicSlug, navigate])

	// read the session, and register the actions menu
	const { data: session } = authClient.useSession()
	useRegisterPodcastEpisodePageActions({
		podcastEpisodePage,
		isSignedIn: Boolean(session),
		onOpenDialog: setOpenDialog,
	})

	const topicHandlers = usePageTopicFeedHandlers(loadPodcastEpisodePage)

	// the loading skeleton, the topic's gate, or the line for an episode that did not load
	if (podcastEpisodePage === undefined) {
		return (
			<main className={PAGE_CLASS}>
				<PodcastEpisodeSkeleton />
			</main>
		)
	}
	if (podcastEpisodePage === null && gatedVisibility) {
		return (
			<main className={PAGE_CLASS}>
				<PodcastEpisodeSkeleton />
				<TopicGateNotice
					visibility={gatedVisibility}
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
	const { podcastEpisode, topic, topicFindings, canRate, transcript } = podcastEpisodePage
	const topicPath = toTopicPath(topic)
	const chapterTopicFeed = { topicFindings, topic, isRatable: canRate, isBookmarkable: false, topicHandlers }
	return (
		<main className={PAGE_CLASS}>
			{/* the cover beside the topic's name, the title, the description, and on a phone the topic's byline */}
			<header className={HEADER_CLASS}>
				<PodcastEpisodeCover podcastEpisode={podcastEpisode} className={COVER_CLASS} />
				<div className="min-w-0 flex-1">
					{/* the topic's line, with the new topic button in the header's top right corner */}
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground min-w-0 text-sm">
							{"Coffee Break podcast · "}
							<AnchorLink href={topicPath} className="text-link hover:underline">
								{topic.name}
							</AnchorLink>
						</p>
						<NewTopicButton onNewTopic={openNewTopicDialog} />
					</div>
					<h1 className="font-display mt-1.5 text-2xl leading-tight sm:text-3xl">
						{podcastEpisode.title}
						<ThemeSongNote />
					</h1>
					{podcastEpisode.description && <p className="mt-1.5 text-sm">{podcastEpisode.description}</p>}
					<TopicByline topic={topic} className="mt-1.5 text-sm sm:hidden" />
				</div>
			</header>

			{/* the player card */}
			<div className="mt-5">
				<PodcastEpisodePlayerCard
					podcastEpisode={podcastEpisode}
					chapterTopicFeed={chapterTopicFeed}
					onOpenPodcastFeedDialog={() => setIsPodcastFeedDialogOpen(true)}
				/>
			</div>

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
type PodcastEpisodeDialog = "share" | "add-topic-to-team" | "remove"

// the loaded page, whether the user is signed in, and the call that opens one of the menu's dialogs
type UseRegisterPodcastEpisodePageActionsOptions = {
	podcastEpisodePage: PodcastEpisodePageResponse | null | undefined
	isSignedIn: boolean
	onOpenDialog: (podcastEpisodeDialog: PodcastEpisodeDialog) => void
}

// register the actions menu for the episode's topic, with Remove episode for a user who may remove the episode
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
						...(podcastEpisodePage?.canRemovePodcastEpisode
							? [{ label: "Remove episode", Icon: Trash2, onSelect: () => onOpenDialog("remove") }]
							: []),
					],
					report: { subjectKind: "topic", subjectId: podcastEpisodeTopic.id, subjectLabel: podcastEpisodeTopic.name },
					hasNewTopicButton: true,
				}
			: null,
	)
}

// the page header's layout, which the skeleton shares
const HEADER_CLASS = "mt-3 flex items-start gap-4"

// the cover's square beside the title, with a card's border and shadow. a narrow screen hides the cover
const COVER_CLASS = "border-separator shadow-lift hidden size-36 shrink-0 rounded-lg border sm:block"

// what hides the chapters section on a narrow screen with JavaScript. the section stays in the html,
// and a browser without JavaScript shows the section at every width
const NARROW_SCREEN_HIDDEN_CLASS = "max-sm:scripted:hidden"

// placeholder keys for the skeleton's chapter rows and transcript lines
const CHAPTER_ROW_SKELETONS = ["c1", "c2", "c3", "c4", "c5"]
const TRANSCRIPT_LINE_SKELETONS = ["t1", "t2", "t3", "t4", "t5", "t6"]

// the podcast episode page's loading skeleton, with the cover and title, the player, the chapters, and the transcript
function PodcastEpisodeSkeleton() {
	return (
		<div aria-hidden="true">
			{/* the placeholder cover, beside the topic's line, the title, the description, and on a phone the byline */}
			<div className={HEADER_CLASS}>
				<div className={cn(COVER_PLACEHOLDER_CLASS, COVER_CLASS)} />
				<div className="min-w-0 flex-1">
					{/* the topic's line beside the new topic button */}
					<div className="flex items-start justify-between gap-3">
						<div className="bg-muted h-4 w-56 max-w-full animate-pulse rounded" />
						<div className="bg-muted h-9 w-32 shrink-0 animate-pulse rounded-md" />
					</div>
					<div className="bg-muted mt-2.5 h-8 w-96 max-w-full animate-pulse rounded" />
					<div className="bg-muted mt-2.5 h-4 w-full animate-pulse rounded" />
					<div className="mt-2.5 flex items-center gap-2 sm:hidden">
						<div className="bg-muted size-6 shrink-0 animate-pulse rounded-full" />
						<div className="bg-muted h-4 w-40 animate-pulse rounded" />
					</div>
				</div>
			</div>

			{/* the player card and the line of its expander */}
			<div className="mt-5">
				<PodcastEpisodePlayerCardSkeleton />
				<ExpanderSkeleton />
			</div>

			{/* the chapters section and its table rows */}
			<CollapsibleSectionSkeleton titleClassName="w-36" className={cn(NARROW_SCREEN_HIDDEN_CLASS, "mt-2")}>
				<TableCard>
					{CHAPTER_ROW_SKELETONS.map((skeletonKey) => (
						<div key={skeletonKey} className="border-separator flex items-center gap-4 border-b py-2 last:border-b-0">
							<div className="bg-muted size-11 shrink-0 animate-pulse rounded-full sm:size-9" />
							<div className="bg-muted h-4 w-40 shrink-0 animate-pulse rounded" />
							<div className="bg-muted h-4 w-10 shrink-0 animate-pulse rounded" />
							<div className="bg-muted h-4 w-10 shrink-0 animate-pulse rounded" />
							<div className="bg-muted h-4 flex-1 animate-pulse rounded" />
						</div>
					))}
				</TableCard>
			</CollapsibleSectionSkeleton>

			{/* the transcript heading and its first lines */}
			<div className="py-2">
				<div className="bg-muted h-7 w-40 animate-pulse rounded" />
			</div>
			<div className={INFO_CARD_CLASS}>
				{TRANSCRIPT_LINE_SKELETONS.map((skeletonKey) => (
					<div key={skeletonKey} className="bg-muted mb-3 h-4 w-full animate-pulse rounded last:mb-0 last:w-2/3" />
				))}
			</div>
		</div>
	)
}

// the collapsed transcript's height, with its last lines fading out. the transcript collapses only with JavaScript
const COLLAPSED_TRANSCRIPT_CLASS = [
	"scripted:max-h-80 scripted:overflow-hidden",
	"scripted:[mask-image:linear-gradient(to_bottom,black_60%,transparent)]",
].join(" ")

// how tall the expanded transcript grows before the transcript scrolls
const EXPANDED_TRANSCRIPT_CLASS = "max-h-160 overflow-y-auto"

// a dashed separator on each side of a chapter's title
const CHAPTER_TITLE_SEPARATOR_CLASS = [
	"before:border-separator-strong before:min-w-6 before:flex-1 before:border-t before:border-dashed",
	"after:border-separator-strong after:min-w-6 after:flex-1 after:border-t after:border-dashed",
].join(" ")

// a podcast episode's transcript, each chapter under its title.
// with JavaScript the transcript collapses behind a control, and the expanded transcript scrolls
function PodcastEpisodeTranscript({ transcript }: { transcript: PodcastEpisodeTranscriptBlock[] }) {
	const [isExpanded, setIsExpanded] = useState(false)
	return (
		<>
			{/* the transcript card */}
			<div
				className={cn(
					INFO_CARD_CLASS,
					isExpanded ? [EXPANDED_TRANSCRIPT_CLASS, HIGHLIGHT_SCROLLBAR_CLASS] : COLLAPSED_TRANSCRIPT_CLASS,
				)}
			>
				{transcript.map((transcriptBlock, transcriptBlockIndex) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a transcript's blocks never reorder
					<div key={transcriptBlockIndex} className="mb-4 last:mb-0">
						{/* a chapter's title inside a dashed separator, or a plain dashed separator over any later block */}
						{transcriptBlock.heading ? (
							<h3 className={cn("mb-2 flex items-center gap-3 text-center font-bold", CHAPTER_TITLE_SEPARATOR_CLASS)}>
								{transcriptBlock.heading}
							</h3>
						) : (
							transcriptBlockIndex > 0 && <hr className="border-separator-strong mb-3 border-t border-dashed" />
						)}
						{/* the block's turns, each after its speaker's name */}
						{transcriptBlock.turns.map((transcriptTurn, transcriptTurnIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a block's turns never reorder
							<p key={transcriptTurnIndex} className="mb-1.5 leading-relaxed">
								<span className="font-semibold">{`${transcriptTurn.speakerName}: `}</span>
								{transcriptTurn.text}
							</p>
						))}
					</div>
				))}
			</div>
			{/* the read more control */}
			<MoreButton
				isExpanded={isExpanded}
				moreLabel="read more "
				lessLabel="read less "
				onToggle={() => setIsExpanded(!isExpanded)}
				className={SCRIPTED_ONLY_CLASS}
			/>
		</>
	)
}
