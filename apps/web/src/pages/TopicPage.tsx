import { authClient } from "@carlnotes/client/authClient"
import { sendTopicFeatureOrder, sendTopicSubscription, type TopicGate } from "@carlnotes/client/topicClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { matchesTopicFindingFilter } from "@carlnotes/core/lib/topicFindingFilters"
import { toSortedTopicFindings } from "@carlnotes/core/lib/topicFindingSorts"
import { sendTopicViewOnce } from "@carlnotes/core/lib/topicViews"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate, useParams } from "@tanstack/react-router"
import type * as React from "react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { NotesSection } from "@/components/note/NotesSection"
import { PodcastEpisodePlayer } from "@/components/podcast/PodcastEpisodePlayer"
import { PodcastEpisodesCard } from "@/components/podcast/PodcastEpisodesCard"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { RelatedTopicsSection } from "@/components/topic/RelatedTopicsSection"
import { NewCountInfo } from "@/components/topic/Topic"
import { TopicActionBar, toTopicActionLayout, toTopicActionOptions } from "@/components/topic/TopicActions"
import { TopicCountsLine } from "@/components/topic/TopicCountsLine"
import { type TopicDialog, TopicDialogs } from "@/components/topic/TopicDialogs"
import { useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { TopicHeader } from "@/components/topic/TopicPageHeader"
import type { FeatureOrderMove } from "@/components/topic/TopicRankDialog"
import { TopicScanButton } from "@/components/topic/TopicScanButton.tsx"
import { TopicScanHistory } from "@/components/topic/TopicScanHistory"
import { TopicSettingsCard } from "@/components/topic/TopicSettingsCard"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useRevealClassName } from "@/hooks/useRevealClassName"
import { useTopicPagePayload } from "@/hooks/useTopicPagePayload"
import { NEXT_SCAN_DISCLAIMER } from "@/lib/utils"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"
import { type TopicFeedHandlers, usePageTopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"
import { useRegisterChatContext } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

/**
 * The topic page at /topics/$topicId/$topicSlug: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { topicId = "", topicSlug } = useParams({ strict: false })
	// the topic page payload, how the topic is gated, and its reload
	const { topic, topicGate, reloadTopicPage } = useTopicPagePayload({ topicId, topicSlug })
	const navigate = useNavigate()
	// the session gates the Follow button. a visitor's click is sent to signup instead
	const { data: session } = authClient().useSession()
	// the shared feed state includes the homepage reload plus the finding filter this page's action bar reads
	const { reloadTopicFeed: reloadHomePage, findingFilter } = useTopicFeed()
	// the open dialog, or null if no dialog is open
	const [openDialog, setOpenDialog] = useState<TopicDialog | null>(null)
	usePageTitle(topic?.name ?? null)

	// report the visit once per topic, naming the topic only if it is public. send the topic view once per tab
	const loadedTopicId = topic?.id
	const loadedTopicVisibility = topic?.visibility
	useEffect(() => {
		if (loadedTopicId === topicId && loadedTopicVisibility) {
			captureVisitEvent(
				"visit_topic_viewed",
				toPublicTopicProperties({ id: topicId, visibility: loadedTopicVisibility }),
			)
			sendTopicViewOnce(topicId)
		}
	}, [topicId, loadedTopicId, loadedTopicVisibility])

	// the owning team a user on none of the topic's teams could join
	const joinTeam = topic?.roomTeams.length === 0 ? topic.teamLink : null
	// where the action bar puts each control, and the New Topic button's dialog
	const topicActionLayout = toTopicActionLayout({
		topic,
		isSignedIn: Boolean(session),
		isBookmarkedView: findingFilter === "bookmarked",
		isJoinable: Boolean(joinTeam),
	})
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()

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

	// the search bar's menu includes this page's options and report option while the topic is on screen
	useRegisterPageActions(
		topic
			? {
					page: "Topic",
					hasTeamBookmarks: topic.isTeamMember,
					options: toTopicActionOptions({
						topic,
						isAdminUser: isAdminRole(session?.user.role),
						topicActionLayout,
						onAddTopicToTeam: () => setOpenDialog("add-topic-to-team"),
						onShareTopic: () => setOpenDialog("share"),
						onToggleFollowTopic: () => void handleSubscriptionToggle(),
						onRankFeaturedTopic: () => setOpenDialog("rank"),
						onEditTopic: () => setOpenDialog("edit-choice"),
						onDeleteTopic: () => setOpenDialog("delete"),
					}),
					report: { subjectKind: "topic", subjectId: topic.id, subjectLabel: topic.name },
					hasNewTopicButton: topicActionLayout.isNewTopicCallToAction,
				}
			: null,
	)

	// run a topic action, then reload the page. returns whether the action succeeded
	const runThenReload = useCallback(
		async (handler: () => Promise<void>): Promise<boolean> => {
			try {
				await handler()
				await reloadTopicPage()
				return true
			} catch (error) {
				console.error("topic action failed", error)
				return false
			}
		},
		[reloadTopicPage],
	)

	// the topic feed handlers, which reload the page after each action
	const topicFeedHandlers = usePageTopicFeedHandlers(reloadTopicPage)

	// toggle this user's subscription
	const handleSubscriptionToggle = async (): Promise<void> => {
		if (!topic) {
			return
		}
		// a visitor has to sign up before subscribing
		if (!session) {
			void navigate(toSignupNavigation("subscribe"))
			return
		}
		const isSubscribing = !topic.isSubscribed
		const isSubscriptionSaved = await runThenReload(() => sendTopicSubscription(topic.id, isSubscribing))
		if (!isSubscriptionSaved) {
			toast.error("That didn't go through. Try again.")
			return
		}
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
				topic={topic}
				isSignedIn={Boolean(session)}
				topicActionLayout={topicActionLayout}
				renderJoinButton={({ isHighlighted }) =>
					joinTeam &&
					topic && (
						<JoinTeamButton
							teamId={joinTeam.teamId}
							teamName={joinTeam.name}
							hasJoinRequest={topic.hasRequestedToJoin}
							isSignedIn={Boolean(session)}
							isHighlighted={isHighlighted}
							onChangeRequest={() => void reloadTopicPage()}
						/>
					)
				}
				scanControl={<TopicScanButton topic={topic} onScanned={reloadTopicPage} />}
				onNewTopic={openNewTopicDialog}
				onSubscriptionToggle={handleSubscriptionToggle}
			/>
			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}

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
							topicFeedHandlers={topicFeedHandlers}
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
					<TopicFindings topic={topic} topicFeedHandlers={topicFeedHandlers} />
					<TopicCards
						topic={topic}
						onMakeTopicPublic={() => setOpenDialog("make-public")}
						onReloadTopicPage={reloadTopicPage}
					/>
					{/* the topic's viewer and follower counts */}
					<TopicCountsLine topicId={topic.id} isPublic={topic.visibility === "public"} />
					<TopicDialogs
						topic={topic}
						openDialog={openDialog}
						onOpenDialog={setOpenDialog}
						onSaveTopic={handleSaveTopic}
						onTopicTeamsChanged={() => void reloadTopicPage()}
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

/**
 * The topic's findings, narrowed and sorted by the shared feed filters. A filter change remounts the section
 * and its hydrate entrance replays.
 */
function TopicFindings({ topic, topicFeedHandlers }: { topic: TopicResponse; topicFeedHandlers: TopicFeedHandlers }) {
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
				topicFeedHandlers={topicFeedHandlers}
				topic={{ id: topic.id, name: topic.name, prompt: topic.prompt, visibility: topic.visibility }}
				newCountInfo={topic.newCount > 0 ? <NewCountInfo topic={topic} /> : undefined}
				latestPodcastEpisode={topic.latestPodcastEpisode}
			/>
		</HydrateSection>
	)
}

/**
 * The topic info card and its settings on the left, its podcast episodes, scan history, notes, and related topics on
 * the right.
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
						canEdit={topic.canEdit}
						topicSources={topic.sources}
						onReloadTopicPage={onReloadTopicPage}
					/>
					{/* the notes on this topic, expanded by default with no note bodies loaded */}
					<NotesSection pageType="topic" pageId={topic.id} titleClassName="font-display text-lg" hasCompactHeader />
					{/* the topics nearest this one that the user may open */}
					<RelatedTopicsSection relatedTopics={topic.relatedTopics} />
				</div>
			</div>
		</HydrateSection>
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
			<TopicGateNotice isSignedIn={isSignedIn} returnPath={`/topics/${topicId}`} />
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
