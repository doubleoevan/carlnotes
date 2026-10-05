import type { TopicResponse } from "@shared/contracts"
import { isTopicSlugStale, toTopicPath } from "@shared/seo"
import { useMatch, useNavigate, useParams } from "@tanstack/react-router"
import type * as React from "react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import {
	type FetchTopicPageOptions,
	fetchTopicPage,
	sendTopicFeatureOrder,
	sendTopicSubscription,
	type TopicGate,
} from "@/clients/topicClient"
import { NotesSection } from "@/components/note/NotesSection"
import { PodcastEpisodePlayer } from "@/components/podcast/PodcastEpisodePlayer"
import { PodcastEpisodesCard } from "@/components/podcast/PodcastEpisodesCard"
import { ShareTopic } from "@/components/share/ShareTopic"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { DeleteTopicDialog } from "@/components/topic/DeleteTopicDialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { NewCountInfo } from "@/components/topic/Topic"
import { isFollowTopicInMenu, TopicActionBar, toTopicActionOptions } from "@/components/topic/TopicActions"
import { TopicEditorChoiceDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { TopicHeader } from "@/components/topic/TopicPageHeader"
import { type FeatureOrderMove, TopicRankDialog } from "@/components/topic/TopicRankDialog"
import { TopicScanButton } from "@/components/topic/TopicScanButton.tsx"
import { TopicScanHistory } from "@/components/topic/TopicScanHistory"
import { TopicSettingsCard } from "@/components/topic/TopicSettingsCard"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { useLoadInBrowser, useOrigin } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useRevealClassName } from "@/hooks/useRevealClassName"
import { matchesTopicFindingFilter } from "@/lib/topicFindingFilters"
import { toSortedTopicFindings } from "@/lib/topicFindingSorts"
import { cn, NEXT_SCAN_DISCLAIMER } from "@/lib/utils"
import { type TopicFeedHandlers, usePageTopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"
import { useRegisterChatContext, useTopicChangeCount } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// the page's dialogs, one open at a time
type TopicDialog = "edit-choice" | "edit" | "make-public" | "share" | "rank" | "delete"

/**
 * The topic page at /topics/$topicId/$topicSlug: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { topicId = "", topicSlug } = useParams({ strict: false })
	// the topic page payload, how the topic is gated, and its reload
	const { topic, topicGate, reloadTopicPage } = useTopicPagePayload({ topicId, topicSlug })
	// the page's origin for the topic-bound mcp url
	const origin = useOrigin()
	const navigate = useNavigate()
	// the session gates the Follow button. a visitor's click is sent to signup instead
	const { data: session } = authClient.useSession()
	// the shared feed state includes the homepage reload plus the finding filter this page's action bar reads
	const { reloadTopicFeed: reloadHomePage, findingFilter } = useTopicFeed()
	// the one dialog on screen, or null when none is open
	const [openDialog, setOpenDialog] = useState<TopicDialog | null>(null)
	usePageTitle(topic?.name ?? null)

	// the owning team a user on none of the topic's teams could join
	const joinTeam = topic?.roomTeams.length === 0 ? topic.teamLink : null
	const actionContext = {
		topic,
		isSignedIn: Boolean(session),
		isBookmarkedView: findingFilter === "bookmarked",
		isJoinable: Boolean(joinTeam),
	}

	// what the shell's chat panel opens on while this topic is on screen
	useRegisterChatContext(
		topic
			? {
					topicId: topic.id,
					teamId: null,
					name: topic.name,
					joinTeam: joinTeam
						? {
								teamId: joinTeam.teamId,
								name: joinTeam.name,
								avatarVersion: joinTeam.avatarVersion,
								hasRequestedToJoin: topic.hasRequestedToJoin,
							}
						: null,
					// the page names its own topic
					pageTopicIds: [topic.id],
				}
			: null,
	)

	// the search bar's menu includes this page's report row while the topic is on screen
	useRegisterPageActions(
		topic
			? {
					page: "Topic",
					hasTeamBookmarks: topic.isTeamMember,
					// the topic-bound mcp server
					mcp: { name: `CarlNotes: ${topic.name}`, url: `${origin}/mcp/t/${topic.id}` },
					options: toTopicActionOptions({
						topic,
						isAdminUser: session?.user.role === "admin",
						isFollowTopicInMenu: isFollowTopicInMenu(actionContext),
						onShareTopic: () => setOpenDialog("share"),
						onToggleFollowTopic: () => void handleSubscriptionToggle(),
						onRankFeaturedTopic: () => setOpenDialog("rank"),
						onEditTopic: () => setOpenDialog("edit-choice"),
						onDeleteTopic: () => setOpenDialog("delete"),
					}),
					report: { subjectKind: "topic", subjectId: topic.id, subjectLabel: topic.name },
				}
			: null,
	)

	// run a topic action, then reload the page
	const runThenReload = useCallback(
		async (handler: () => Promise<void>) => {
			try {
				await handler()
				await reloadTopicPage()
			} catch (error) {
				console.error("topic action failed", error)
			}
		},
		[reloadTopicPage],
	)

	// the topic feed handlers, which reload the page after each action
	const topicHandlers = usePageTopicFeedHandlers(reloadTopicPage)

	// toggle this user's subscription
	const handleSubscriptionToggle = async (): Promise<void> => {
		if (!topic) {
			return
		}
		// a visitor has to sign up before subscribing
		if (!session) {
			void navigate({ to: "/signup", search: { cta: "subscribe" } })
			return
		}
		const isSubscribing = !topic.isSubscribed
		await runThenReload(() => sendTopicSubscription(topic.id, isSubscribing))
		// an invite topic only shows findings from the next scan onward, which the toast spells out
		const disclaimer = isSubscribing && topic.visibility === "invite" ? `\n${NEXT_SCAN_DISCLAIMER}` : ""
		toast(isSubscribing ? `Following ${topic.name}.${disclaimer}` : `Unfollowed ${topic.name}.`)
	}

	// send the rank dialog's moves one at a time, then reload both feeds once
	const handleRankTopic = async (moves: FeatureOrderMove[]): Promise<void> => {
		await runThenReload(async () => {
			for (const move of moves) {
				await sendTopicFeatureOrder(move.topicId, move.position)
			}
		})
		await reloadHomePage()
	}

	// a saved edit reloads this page and the homepage feed behind it
	const handleSaveTopic = async (): Promise<void> => {
		setOpenDialog(null)
		await reloadTopicPage()
		await reloadHomePage()
	}

	// the bottom padding clears the docked chat panel, so the last card can scroll out from under it
	return (
		<main className="mx-auto max-w-5xl px-safe pt-3 pb-28">
			<TopicActionBar
				{...actionContext}
				joinButton={
					joinTeam &&
					topic && (
						<JoinTeamButton
							teamId={joinTeam.teamId}
							teamName={joinTeam.name}
							hasJoinRequest={topic.hasRequestedToJoin}
							isSignedIn={Boolean(session)}
							onChangeRequest={() => void reloadTopicPage()}
						/>
					)
				}
				scanControl={<TopicScanButton topic={topic} onScanned={reloadTopicPage} />}
				onSubscriptionToggle={handleSubscriptionToggle}
			/>

			{/* the loading skeleton, the not-found or not visible line, or the hydrating topic sections */}
			{!topic && (
				<TopicPagePlaceholder
					isLoading={topic === undefined}
					topicGate={topicGate}
					isSignedIn={Boolean(session)}
					topicId={topicId}
				/>
			)}
			{topic && (
				<>
					{/* the topic header: the title with its chat mention badge, then the tags */}
					<HydrateSection index={0}>
						<TopicHeader topic={topic} />
					</HydrateSection>
					{/* the podcast episode player */}
					<HydrateSection index={1}>
						<PodcastEpisodePlayer
							topic={topic}
							topicHandlers={topicHandlers}
							scanControl={
								<TopicScanButton
									topic={topic}
									onScanned={reloadTopicPage}
									shouldPollTopicPage={false}
									scanHint="to try again..."
								/>
							}
						/>
					</HydrateSection>
					<TopicFindings topic={topic} topicHandlers={topicHandlers} />
					<TopicCards
						topic={topic}
						onMakeTopicPublic={() => setOpenDialog("make-public")}
						onReloadTopicPage={reloadTopicPage}
					/>
					<TopicDialogs
						topic={topic}
						openDialog={openDialog}
						onOpenDialog={setOpenDialog}
						onSaveTopic={handleSaveTopic}
						onRankTopic={handleRankTopic}
						onTopicDeleted={async () => {
							await reloadHomePage()
							void navigate({ to: "/" })
						}}
					/>
				</>
			)}
		</main>
	)
}

// the topic id from the url, and the slug if the url has one
type UseTopicPagePayloadOptions = { topicId: string; topicSlug: string | undefined }

// the topic page payload and how the topic is gated, seeded by the server's read and reloaded on a new topic id or a chat change
function useTopicPagePayload({ topicId, topicSlug }: UseTopicPagePayloadOptions): {
	topic: TopicResponse | null | undefined
	topicGate: TopicGate | null
	reloadTopicPage: (fetchTopicPageOptions?: FetchTopicPageOptions) => Promise<void>
} {
	const navigate = useNavigate()
	// the public topic either topic route loads on the server, or nothing
	const loadedTopicById = useMatch({
		from: "/_layout/topics/$topicId",
		shouldThrow: false,
		select: (topicMatch) => topicMatch.loaderData?.topic,
	})
	const loadedTopicBySlug = useMatch({
		from: "/_layout/topics/$topicId_/$topicSlug",
		shouldThrow: false,
		select: (topicMatch) => topicMatch.loaderData?.topic,
	})
	const loadedTopic = loadedTopicById ?? loadedTopicBySlug
	// the topic page payload. undefined while loading, null if missing or not visible
	const [topic, setTopic] = useState<TopicResponse | null | undefined>(loadedTopic ?? undefined)
	// the gate in front of an invite or private topic that the user may not see
	const [topicGate, setTopicGate] = useState<TopicGate | null>(null)

	// fetch the topic page payload, which says whether the topic is visible, gated to this user, or missing
	const reloadTopicPage = useCallback(
		async (fetchTopicPageOptions: FetchTopicPageOptions = {}) => {
			try {
				const topicPage = await fetchTopicPage(topicId, fetchTopicPageOptions)
				setTopic(topicPage.status === "visible" ? topicPage.topic : null)
				setTopicGate(topicPage.status === "gated" ? topicPage.topicGate : null)
			} catch (error) {
				console.error("topic page load failed", error)
				setTopic(null)
			}
		},
		[topicId],
	)
	// keep the topic if its id matches the url, otherwise show the skeleton, then reload the page payload. the first
	// load skips while hydrating the public topic the server loaded, unless a scan was running, whose findings may have changed since
	const resetAndReloadTopicPage = useCallback((): void => {
		setTopic((previousTopic) => (previousTopic?.id === topicId ? previousTopic : undefined))
		setTopicGate(null)
		void reloadTopicPage()
	}, [reloadTopicPage, topicId])
	const isLoadedOnServer =
		loadedTopic?.id === topicId && !loadedTopic.scans.some((topicScan) => topicScan.status === "running")
	useLoadInBrowser({ pageId: topicId, isLoadedOnServer, loadPage: resetAndReloadTopicPage })

	// redirect a url by id alone or with a stale slug to the topic's current path once the url's topic loads
	useEffect(() => {
		if (topic?.id === topicId && isTopicSlugStale(topic, topicSlug)) {
			navigate({ to: toTopicPath(topic), replace: true })
		}
	}, [topic, topicId, topicSlug, navigate])

	// reload the page each time the chat panel reports this topic changed
	const topicChangeCount = useTopicChangeCount(topic?.id ?? null)
	useEffect(() => {
		if (topicChangeCount > 0) {
			void reloadTopicPage()
		}
	}, [topicChangeCount, reloadTopicPage])
	return { topic, topicGate, reloadTopicPage }
}

/**
 * The topic's findings, narrowed and sorted by the shared feed filters. A filter change remounts the section
 * and its hydrate entrance replays.
 */
function TopicFindings({ topic, topicHandlers }: { topic: TopicResponse; topicHandlers: TopicFeedHandlers }) {
	const { findingFilter, sort, resourceKinds, bookmarkScope } = useTopicFeed()

	// the findings this user sees
	const topicFindings = toSortedTopicFindings(
		topic.findings.filter(
			(finding) =>
				resourceKinds.has(finding.resourceKind) && matchesTopicFindingFilter(finding, findingFilter, bookmarkScope),
		),
		sort,
	)
	const viewKey = `${findingFilter}-${sort}-${bookmarkScope}-${[...resourceKinds].sort().join()}`
	return (
		<HydrateSection key={viewKey} index={2}>
			<TopicFindingsSection
				topicFindings={topicFindings}
				hasAnyFindings={topic.findings.length > 0}
				isRatable={topic.canRate}
				isBookmarkable={topic.isTopicOwner || topic.isTeamMember}
				handlers={topicHandlers}
				topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
				newCountInfo={topic.newCount > 0 ? <NewCountInfo topic={topic} /> : undefined}
				latestPodcastEpisode={topic.podcast?.latestPodcastEpisode}
			/>
		</HydrateSection>
	)
}

/**
 * The topic info card and its settings on the left, its podcast episodes, scan history, and notes on the right.
 */
function TopicCards({
	topic,
	onMakeTopicPublic,
	onReloadTopicPage,
}: {
	topic: TopicResponse
	onMakeTopicPublic: () => void
	onReloadTopicPage: () => Promise<void>
}) {
	return (
		<HydrateSection index={3}>
			<div className="grid gap-x-8 lg:grid-cols-[32rem_minmax(0,1fr)]">
				{/* the topic info card, then the settings card under it */}
				<div className="min-w-0">
					<TopicInfoCard topic={topic} onMakeTopicPublic={onMakeTopicPublic} />
					<TopicSettingsCard topic={topic} />
				</div>
				{/* a grid item sizes to its widest content unless told not to, so long urls inside these cards
				    would push the column past the viewport instead of truncating */}
				<div className="min-w-0">
					{/* the podcast episodes card */}
					<PodcastEpisodesCard topic={topic} onPodcastEpisodeRemoved={onReloadTopicPage} />
					<TopicScanHistory
						scans={topic.scans}
						allowedUrls={new Set(topic.findings.map((finding) => finding.url))}
						findings={topic.findings}
						topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
					/>
					{/* the notes on this topic, expanded by default with no note bodies loaded */}
					<NotesSection pageType="topic" pageId={topic.id} titleClassName="font-display text-lg" />
				</div>
			</div>
		</HydrateSection>
	)
}

/**
 * The topic's dialogs, one at a time. Each mounts only while it is the open one, and its state resets every time.
 */
function TopicDialogs({
	topic,
	openDialog,
	onOpenDialog,
	onSaveTopic,
	onRankTopic,
	onTopicDeleted,
}: {
	topic: TopicResponse
	openDialog: TopicDialog | null
	onOpenDialog: (dialog: TopicDialog | null) => void
	onSaveTopic: () => Promise<void>
	onRankTopic: (moves: FeatureOrderMove[]) => Promise<void>
	onTopicDeleted: () => Promise<void>
}) {
	return (
		<>
			{/* the edit option asks form or Carl first. the form choice opens the modal in its place */}
			{openDialog === "edit-choice" && (
				<TopicEditorChoiceDialog
					topicId={topic.id}
					onChooseTopicForm={() => onOpenDialog("edit")}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{(openDialog === "edit" || openDialog === "make-public") && (
				<EditTopicModal
					topic={topic}
					isMakingTopicPublic={openDialog === "make-public"}
					onClose={() => onOpenDialog(null)}
					onTopicSaved={onSaveTopic}
				/>
			)}
			{openDialog === "share" && (
				<ShareTopic
					topic={topic}
					isDialog
					onClose={() => onOpenDialog(null)}
					onMakeTopicPublic={() => onOpenDialog("make-public")}
				/>
			)}
			{openDialog === "rank" && (
				<TopicRankDialog topic={topic} onSave={onRankTopic} onClose={() => onOpenDialog(null)} />
			)}
			{openDialog === "delete" && (
				<DeleteTopicDialog topic={topic} onClose={() => onOpenDialog(null)} onTopicDeleted={onTopicDeleted} />
			)}
		</>
	)
}

// what shows in place of the topic
function TopicPagePlaceholder({
	isLoading,
	topicGate,
	isSignedIn,
	topicId,
}: {
	isLoading: boolean
	topicGate: TopicGate | null
	isSignedIn: boolean
	topicId: string
}) {
	if (isLoading) {
		return <TopicSkeleton />
	}
	if (!topicGate) {
		return <p className="text-muted-foreground mt-6 text-sm">{"Carl couldn't find this topic. He checked twice."}</p>
	}
	// the page's skeleton behind the notice, titled with an invite topic's name
	return (
		<>
			<TopicSkeleton topicTitle={topicGate.topicName ?? undefined} />
			<TopicGateNotice visibility={topicGate.visibility} isSignedIn={isSignedIn} returnPath={`/topics/${topicId}`} />
		</>
	)
}

// the index of the last section in view when the page opens
const LAST_TOP_SECTION_INDEX = 2

// a section that plays the staggered hydrate animation as it appears. a server-rendered page shows every section before
// any script runs and animates only the top ones, and a page rendered in the browser reveals each section as it scrolls into view
function HydrateSection({ index, children }: { index: number; children: React.ReactNode }) {
	const { ref, revealClassName } = useRevealClassName<HTMLDivElement>({
		isAnimatedOnServer: index <= LAST_TOP_SECTION_INDEX,
	})
	return (
		<div
			ref={ref}
			data-reveal
			className={cn(revealClassName, "motion-reduce:animate-none motion-reduce:opacity-100")}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{children}
		</div>
	)
}
