import { authClient } from "@carlnotes/client/authClient"
import { sendTopicHomeOrder, sendTopicSubscription, type TopicGate } from "@carlnotes/client/topicClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { PodcastEpisodeRemovalProvider } from "@carlnotes/core/components/PodcastEpisodeRemovalProvider"
import { toTopicTopicPostCardPages } from "@carlnotes/core/lib/cardSections"
import { toSavedTopicCounts } from "@carlnotes/core/lib/pageReads"
import { sendTopicViewOnce } from "@carlnotes/core/lib/pageViews"
import type { FeaturedOrderMove } from "@carlnotes/core/lib/rankDialog"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { PodcastEpisodePlayer } from "@/components/podcast/PodcastEpisodePlayer"
import { TopicVideoSection } from "@/components/podcast/TopicVideoSection"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { SocialSection } from "@/components/social/SocialSection"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { HydrateSection } from "@/components/topic/HydrateSection"
import { TopicActionBar, toTopicActionLayout, toTopicActionOptions } from "@/components/topic/TopicActions"
import { TopicCountsLine } from "@/components/topic/TopicCountsLine"
import { type TopicDialog, TopicDialogs } from "@/components/topic/TopicDialogs"
import { useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { TopicFindings } from "@/components/topic/TopicFindings"
import { TopicGateNotice } from "@/components/topic/TopicGateNotice"
import { TopicLinkedFinding } from "@/components/topic/TopicLinkedFinding"
import { TopicHeader } from "@/components/topic/TopicPageHeader"
import { TopicScanButton } from "@/components/topic/TopicScanButton.tsx"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { TopicViews } from "@/components/topic/TopicViews"
import { TopicPostsSection } from "@/components/topicPost/TopicPostsSection"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useTopicFindings } from "@/hooks/useTopicFindings"
import { useTopicPagePayload } from "@/hooks/useTopicPagePayload"
import { sendFeaturedOrderMoves } from "@/lib/featuredOrderMoves"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { NEXT_SCAN_DISCLAIMER } from "@/lib/utils"
import { captureVisitEvent, toPublicTopicProperties } from "@/lib/visitAnalytics"
import { usePageTopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"
import { useRegisterChatContext } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

/**
 * The topic page at /topics/$topicId/$topicSlug: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { topicId = "", topicSlug } = useParams({ strict: false })
	// the topic page payload, how the topic is gated, and its reload
	const { topic, topicGate, reloadTopicPage, changeTopicFinding } = useTopicPagePayload({ topicId, topicSlug })
	const navigate = useNavigate()
	// the session gates the Follow button. a visitor's click is sent to signup instead
	const { data: session } = authClient().useSession()
	// the shared feed state includes the homepage reload plus the finding filter this page's action bar reads
	const { reloadTopicFeed: reloadHomePage, findingFilter } = useTopicFeed()
	// the open dialog, or null if no dialog is open
	const [openDialog, setOpenDialog] = useState<TopicDialog | null>(null)
	// the counts that the comment thread and the notes section report once they load, for the header's details line
	const [commentCount, setCommentCount] = useState<number | null>(null)
	const [noteCount, setNoteCount] = useState<number | null>(null)
	// the findings that the findings section lists, which the header's details line counts
	const topicFindings = useTopicFindings(topic)
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
						onRankHomeTopic: () => setOpenDialog("rank"),
						onRankProfileTopic: () => setOpenDialog("rank-profile"),
						onEditTopic: () => setOpenDialog("edit-choice"),
						onEditTopicVideo: () => setOpenDialog("edit-film"),
						onEditPodcastEpisode: () => setOpenDialog("edit-podcast"),
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

	// the topic feed handlers, which reload the page after each action and keep a saved reaction on the page
	const topicFeedHandlers = usePageTopicFeedHandlers(reloadTopicPage, changeTopicFinding)

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
	const handleRankTopic = async (featuredOrderMoves: FeaturedOrderMove[]): Promise<void> => {
		await runThenReload(() => sendFeaturedOrderMoves(featuredOrderMoves, sendTopicHomeOrder))
		await reloadHomePage()
	}

	// a saved edit reloads this page and the homepage feed behind it
	const handleSaveTopic = async (): Promise<void> => {
		setOpenDialog(null)
		await reloadTopicPage()
		await reloadHomePage()
	}

	return (
		<main className={PAGE_CLASS}>
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
					{/* the topic header: the title with its chat mention badge, the tags, and the page's counts */}
					<HydrateSection index={0}>
						<TopicHeader
							topic={topic}
							isSignedIn={Boolean(session)}
							findingCount={topicFindings.length}
							commentCount={commentCount}
							noteCount={noteCount}
							onEditImage={() => setOpenDialog("edit-image")}
						/>
					</HydrateSection>
					{/* the topic video section, then the podcast episode player */}
					<HydrateSection index={1}>
						<TopicVideoSection topic={topic} onVideoRenderingPoll={() => reloadTopicPage({ isPoll: true })} />
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
					<TopicLinkedFinding topic={topic} topicFeedHandlers={topicFeedHandlers} />
					<TopicFindings topic={topic} topicFeedHandlers={topicFeedHandlers} />
					{/* the topic's comment thread, whose first page came with the page */}
					<HydrateSection index={3}>
						<SocialSection
							target={{ kind: "topic", id: topic.id }}
							firstPage={topic.commentThread}
							isSignedIn={Boolean(session)}
							topicId={topic.id}
							isTopicOwner={topic.isTopicOwner}
							hasClosedDivider
							onCommentCountChange={setCommentCount}
						/>
					</HydrateSection>
					{/* the topic's Topic Posts, right below its comment thread */}
					{topic.topicPosts && (
						<TopicPostsSection
							topicId={topic.id}
							{...topic.topicPosts}
							serverPages={toTopicTopicPostCardPages(topic)}
						/>
					)}
					<PodcastEpisodeRemovalProvider key={JSON.stringify([topic.id, session?.user.id])}>
						<TopicViews
							topic={topic}
							onMakeTopicPublic={() => setOpenDialog("make-public")}
							onReloadTopicPage={reloadTopicPage}
							onNoteCountChange={setNoteCount}
						/>
					</PodcastEpisodeRemovalProvider>
					{/* the topic's viewer and follower counts */}
					<TopicCountsLine
						topicId={topic.id}
						isPublic={topic.visibility === "public"}
						savedCounts={toSavedTopicCounts(topic)}
					/>
					<TopicDialogs
						topic={topic}
						openDialog={openDialog}
						onOpenDialog={setOpenDialog}
						onSaveTopic={handleSaveTopic}
						onTopicTeamsChanged={() => void reloadTopicPage()}
						onTopicImageChanged={() => void reloadTopicPage()}
						onPodcastEpisodeChanged={() => void reloadTopicPage()}
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
