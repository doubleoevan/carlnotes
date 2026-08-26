import { type TopicResponse, toCtaTag } from "@shared/contracts"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import {
	fetchTopicPage,
	sendManualScan,
	sendStopScan,
	sendTopicFeatureOrder,
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
	sendTopicSubscription,
} from "@/clients/topicClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { ShareTopicButton } from "@/components/share/ShareTopic"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { DeleteTopicDialog } from "@/components/topic/DeleteTopicDialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { NewCountInfo } from "@/components/topic/Topic"
import { TopicActionBar, toTopicActionBar, toTopicActionOptions } from "@/components/topic/TopicActions"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { TopicHeader } from "@/components/topic/TopicPageHeader"
import { TopicRankDialog } from "@/components/topic/TopicRankDialog"
import { TopicScanHistory } from "@/components/topic/TopicScanHistory"
import { TopicSettingsCard } from "@/components/topic/TopicSettingsCard"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { useIsVisible } from "@/hooks/useIsVisible"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useManualScanProgress, usePollWhileScanning } from "@/hooks/useTopicScan"
import { matchesTopicFindingFilter } from "@/lib/topicFindingFilters"
import { toSortedTopicFindings } from "@/lib/topicFindingSorts"
import { cn, NEXT_SCAN_DISCLAIMER } from "@/lib/utils"
import { type TopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"
import { setChatPanelState, useRegisterChatContext } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

/**
 * One scan control's send, shared by starting a scan and stopping one. The caller flips its optimistic
 * state first, and a rejected send puts that state back with a toast the user can read.
 */
async function runScanControl({
	send,
	reload,
	revert,
	logLabel,
	fallbackMessage,
}: {
	send: () => Promise<unknown>
	reload: () => Promise<void>
	revert: () => void
	logLabel: string
	// what the toast says when the rejection has no message of its own
	fallbackMessage: string
}): Promise<void> {
	try {
		await send()
		await reload()
	} catch (error) {
		console.error(logLabel, error)
		toast.error(error instanceof Error ? error.message : fallbackMessage)
		revert()
	}
}

/**
 * The page for a single topic at /topics/:id: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { id = "" } = useParams()
	const navigate = useNavigate()
	// the session gates the Follow button. a visitor's click is sent to signup instead
	const { data: session } = authClient.useSession()
	// the shared feed state includes the homepage reload plus the finding filter, sort, and resource filters
	const { reload: reloadHomePage, findingFilter, sort, resourceKinds, bookmarkScope } = useTopicFeed()
	// the topic page payload. undefined while loading, null when missing or not visible
	const [topicResponse, setTopicResponse] = useState<TopicResponse | null | undefined>(undefined)
	// how the topic is gated if this user may not see it, an invite topic's gate shows its name, a private topic
	const [gatedTopic, setGatedTopic] = useState<{ topicName: string | null } | null>(null)
	// how the edit modal opened, or null while it is closed
	const [editMode, setEditMode] = useState<"edit" | "make-public" | null>(null)
	const [isDeleteOpen, setIsDeleteOpen] = useState(false)
	const [isRankOpen, setIsRankOpen] = useState(false)
	const [isSharing, setIsSharing] = useState(false)
	usePageTitle(topicResponse?.name ?? null)

	// the manual scan block belongs to an owner with a quota, known only once the payload arrives
	const isManualScanShown = topicResponse?.manualScansRemaining != null

	// the owning team a user on none of the topic's teams could join
	const joinTeam = topicResponse?.roomTeams.length === 0 ? topicResponse.teamLink : null
	const {
		isJoinCallToAction,
		isFollowCallToAction,
		isFollowInMenu,
		isTeamUpInRow,
		isTeamUpCallToAction,
		isShareInRow,
	} = toTopicActionBar({
		topic: topicResponse,
		isSignedIn: Boolean(session),
		isManualScanShown,
		isBookmarkedView: findingFilter === "bookmarked",
		isJoinable: Boolean(joinTeam),
	})

	// what the shell's chat panel opens on while this topic is on screen
	useRegisterChatContext(
		topicResponse
			? {
					topicId: topicResponse.id,
					teamId: null,
					name: topicResponse.name,
					joinTeam: joinTeam
						? {
								teamId: joinTeam.teamId,
								name: joinTeam.name,
								hasAvatar: joinTeam.hasAvatar,
								hasRequestedToJoin: topicResponse.hasRequestedToJoin,
							}
						: null,
					// the page names its own topic
					pageTopicIds: [topicResponse.id],
				}
			: null,
	)

	// the search bar's menu includes this page's report row while the topic is on screen
	useRegisterPageActions(
		topicResponse
			? {
					page: "Topic",
					hasTeamBookmarks: topicResponse.isTeamMember,
					options: toTopicActionOptions({
						topic: topicResponse,
						isAdmin: session?.user.role === "admin",
						isFollowInMenu,
						onShare: () => setIsSharing(true),
						onToggleFollow: () => void handleSubscriptionToggle(),
						onRank: () => setIsRankOpen(true),
						onEdit: () => setEditMode("edit"),
						onDelete: () => setIsDeleteOpen(true),
					}),
					report: { subjectKind: "topic", subjectId: topicResponse.id, subjectLabel: topicResponse.name },
				}
			: null,
	)
	const { isScanning, isRunningScan, isCancellingScan, startScan, stopScan, cancelScan, stopCancelling } =
		useManualScanProgress(topicResponse?.scans)

	// reload the page payload when the topic id changes
	const reloadTopicPage = useCallback(async () => {
		try {
			const topicPage = await fetchTopicPage(id)
			setTopicResponse(topicPage.status === "visible" ? topicPage.topic : null)
			setGatedTopic(topicPage.status === "gated" ? { topicName: topicPage.topicName } : null)
		} catch (error) {
			console.error("topic page load failed", error)
			setTopicResponse(null)
		}
	}, [id])
	// clearing first falls back to the skeleton
	useEffect(() => {
		setTopicResponse(undefined)
		setGatedTopic(null)
		void reloadTopicPage()
	}, [reloadTopicPage])

	// reload the page after running a topic feed handler
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
	const handlers: TopicFeedHandlers = useMemo(
		() => ({
			openTopicFinding: (findingId) => runThenReload(() => sendTopicFindingOpened(findingId)),
			consumeTopicFinding: (findingId, isConsumed) =>
				runThenReload(() => sendTopicFindingConsumed(findingId, isConsumed)),
			rateTopicFinding: (findingId, rating) => runThenReload(() => sendTopicFindingRating(findingId, rating)),
			bookmarkTopicFinding: (findingId, isBookmarked) =>
				runThenReload(() => sendTopicFindingBookmark(findingId, isBookmarked)),
		}),
		[runThenReload],
	)

	// toggle this user's subscription
	const handleSubscriptionToggle = async (): Promise<void> => {
		if (!topicResponse) {
			return
		}
		// a visitor has to sign up before subscribing
		if (!session) {
			navigate("/signup?cta=subscribe")
			return
		}
		const isSubscribing = !topicResponse.isSubscribed
		await runThenReload(() => sendTopicSubscription(topicResponse.id, isSubscribing))
		// an invite topic only shows findings from the next scan onward, which the toast says out loud
		const disclaimer = isSubscribing && topicResponse.visibility === "invite" ? `\n${NEXT_SCAN_DISCLAIMER}` : ""
		toast(isSubscribing ? `Following ${topicResponse.name}.${disclaimer}` : `Unfollowed ${topicResponse.name}.`)
	}

	// ranking a topic shifts the other featured topic orders
	const handleTopicRank = async (topicId: string, position: number): Promise<void> => {
		await runThenReload(() => sendTopicFeatureOrder(topicId, position))
		await reloadHomePage()
	}

	// trigger a manual scan. isRunningScan shows the state until the new scan row appears in a reload
	const handleManualScan = async (): Promise<void> => {
		if (!topicResponse) {
			return
		}
		startScan()
		await runScanControl({
			send: () => sendManualScan(topicResponse.id),
			reload: reloadTopicPage,
			revert: stopScan,
			logLabel: "manual scan failed",
			fallbackMessage: "The raccoon got that one. Carl suggests you put another pot on.",
		})
	}

	// cancel the running scan. The scan keeps what was already collected, and the scan limit slot is given back
	const handleCancelScan = async (): Promise<void> => {
		if (!topicResponse) {
			return
		}
		cancelScan()
		await runScanControl({
			send: () => sendStopScan(topicResponse.id),
			reload: reloadTopicPage,
			// the scan is still going, so the stop icon comes back instead of leaving a running scan with no way to stop it
			revert: stopCancelling,
			logLabel: "stopping the scan failed",
			fallbackMessage: "Carl didn't catch that. That brew is still going.",
		})
	}

	// a saved edit reloads this page and the homepage feed behind it
	const handleTopicSaved = async (): Promise<void> => {
		setEditMode(null)
		await reloadTopicPage()
		await reloadHomePage()
	}

	// the findings this user sees
	const visibleFindings = toSortedTopicFindings(
		(topicResponse?.findings ?? []).filter(
			(finding) =>
				resourceKinds.has(finding.resourceKind) && matchesTopicFindingFilter(finding, findingFilter, bookmarkScope),
		),
		sort,
	)
	// a filter change remounts the findings section so its hydrate entrance replays using a findingFilter key
	const viewKey = `${findingFilter}-${sort}-${bookmarkScope}-${[...resourceKinds].sort().join()}`

	// poll starts on the click itself, not just once the row is visible
	usePollWhileScanning(isScanning || isRunningScan, reloadTopicPage)

	// one join control serves both the action row and the room's way in
	const joinButton = joinTeam && topicResponse && (
		<JoinTeamButton
			teamId={joinTeam.teamId}
			teamName={joinTeam.name}
			hasJoinRequest={topicResponse.hasRequestedToJoin}
			isSignedIn={Boolean(session)}
			onChangeRequest={() => void reloadTopicPage()}
		/>
	)

	// the bottom padding clears the docked chat panel, so the last card can scroll out from under it
	return (
		<main className="mx-auto max-w-5xl px-safe pt-3 pb-28">
			<TopicActionBar
				topic={topicResponse}
				isSignedIn={Boolean(session)}
				isShareInRow={isShareInRow}
				isJoinCallToAction={isJoinCallToAction}
				joinButton={joinButton}
				isFollowCallToAction={isFollowCallToAction}
				isTeamUpInRow={isTeamUpInRow}
				isTeamUpCallToAction={isTeamUpCallToAction}
				isManualScanShown={isManualScanShown}
				isRunning={isRunningScan || isScanning}
				isCancellable={isScanning}
				isCancelling={isCancellingScan}
				onSubscriptionToggle={handleSubscriptionToggle}
				onManualScan={handleManualScan}
				onCancelScan={handleCancelScan}
			/>

			{/* the loading skeleton, the not-found or not visible line, or the hydrating topic sections */}
			{!topicResponse && (
				<TopicPagePlaceholder
					isLoading={topicResponse === undefined}
					gatedTopic={gatedTopic}
					isSignedIn={Boolean(session)}
					topicId={id}
				/>
			)}
			{topicResponse && (
				<TopicPageBody
					topic={topicResponse}
					viewKey={viewKey}
					visibleFindings={visibleFindings}
					handlers={handlers}
					editMode={editMode}
					isSharing={isSharing}
					isRankOpen={isRankOpen}
					isDeleteOpen={isDeleteOpen}
					onOpenChat={() => setChatPanelState("open")}
					onEditModeChange={setEditMode}
					onCloseShare={() => setIsSharing(false)}
					onCloseRank={() => setIsRankOpen(false)}
					onCloseDelete={() => setIsDeleteOpen(false)}
					onTopicSaved={handleTopicSaved}
					onTopicRank={handleTopicRank}
					onTopicDeleted={async () => {
						await reloadHomePage()
						navigate("/")
					}}
				/>
			)}
		</main>
	)
}

/**
 * The page once the payload has arrived: the header, the findings, the two cards, the owner dialogs,
 * and the docked chat panel. Each dialog mounts only while open so its state resets every time.
 */
function TopicPageBody({
	topic,
	viewKey,
	visibleFindings,
	handlers,
	editMode,
	isSharing,
	isRankOpen,
	isDeleteOpen,
	onOpenChat,
	onEditModeChange,
	onCloseShare,
	onCloseRank,
	onCloseDelete,
	onTopicSaved,
	onTopicRank,
	onTopicDeleted,
}: {
	topic: TopicResponse
	// remounting on this key replays the findings entrance whenever a filter changes
	viewKey: string
	visibleFindings: TopicResponse["findings"]
	handlers: TopicFeedHandlers
	editMode: "edit" | "make-public" | null
	isSharing: boolean
	isRankOpen: boolean
	isDeleteOpen: boolean
	onOpenChat: () => void
	onEditModeChange: (editMode: "edit" | "make-public" | null) => void
	onCloseShare: () => void
	onCloseRank: () => void
	onCloseDelete: () => void
	onTopicSaved: () => Promise<void>
	onTopicRank: (topicId: string, position: number) => Promise<void>
	onTopicDeleted: () => Promise<void>
}) {
	return (
		<>
			{/* the topic header: the title with its mention badge, then the tags */}
			<HydrateSection index={0}>
				<TopicHeader topic={topic} onOpenChat={onOpenChat} />
			</HydrateSection>

			{/* findings, full width, narrowed by the findingFilter filters */}
			<HydrateSection key={viewKey} index={1}>
				<TopicFindingsSection
					topicFindings={visibleFindings}
					hasAnyFindings={topic.findings.length > 0}
					isRatable={topic.canRate}
					isBookmarkable={topic.isOwner || topic.isTeamMember}
					handlers={handlers}
					topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
					newCountInfo={topic.newCount > 0 ? <NewCountInfo topic={topic} /> : undefined}
				/>
			</HydrateSection>

			{/* the topic info card on the left, scan history and settings on the right */}
			<HydrateSection index={2}>
				<div className="grid gap-x-8 lg:grid-cols-[32rem_minmax(0,1fr)]">
					<TopicInfoCard topic={topic} onMakeTopicPublic={() => onEditModeChange("make-public")} />
					{/* a grid item sizes to its widest content unless told not to, so long urls inside these cards
					    would push the column past the viewport instead of truncating */}
					<div className="min-w-0">
						<TopicScanHistory
							scans={topic.scans}
							allowedUrls={new Set(topic.findings.map((finding) => finding.url))}
							findings={topic.findings}
							topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
						/>
						<TopicSettingsCard topic={topic} />
					</div>
				</div>
			</HydrateSection>

			{editMode && (
				<EditTopicModal
					topic={topic}
					isMakingTopicPublic={editMode === "make-public"}
					onClose={() => onEditModeChange(null)}
					onTopicSaved={onTopicSaved}
				/>
			)}
			{isSharing && (
				<ShareTopicButton
					topic={topic}
					isDialog
					onClose={onCloseShare}
					onMakeTopicPublic={() => onEditModeChange("make-public")}
				/>
			)}
			{isRankOpen && <TopicRankDialog topic={topic} onRank={onTopicRank} onClose={onCloseRank} />}
			{isDeleteOpen && <DeleteTopicDialog topic={topic} onClose={onCloseDelete} onTopicDeleted={onTopicDeleted} />}
		</>
	)
}

// what stands in for the topic
function TopicPagePlaceholder({
	isLoading,
	gatedTopic,
	isSignedIn,
	topicId,
}: {
	isLoading: boolean
	gatedTopic: { topicName: string | null } | null
	isSignedIn: boolean
	topicId: string
}) {
	if (isLoading) {
		return <TopicSkeleton />
	}
	if (!gatedTopic) {
		return <p className="text-muted-foreground mt-6 text-sm">{"Carl couldn't find this topic. He checked twice."}</p>
	}
	// the page's skeleton behind the notice. the title is shown for an invite topic the user does not have access to
	return (
		<>
			<TopicSkeleton topicTitle={gatedTopic.topicName ?? undefined} />
			<TopicGateNotice isSignedIn={isSignedIn} topicId={topicId} />
		</>
	)
}

/**
 * What a user sees when they open a topic they don't have access to: the page's skeleton behind a notice.
 */
function TopicGateNotice({ isSignedIn, topicId }: { isSignedIn: boolean; topicId: string }) {
	const navigate = useNavigate()

	// where a visitor returns after signing up
	const returnPath = `?next=${encodeURIComponent(`/topics/${topicId}`)}`
	// which arrival a signup gets attributed to for analytics
	const [searchParams] = useSearchParams()
	const ctaTag = toCtaTag(searchParams.get("src")) ?? "gate"
	return (
		<Dialog open onOpenChange={() => navigate("/")}>
			{/* the gate's own actions are the only ways out, so there is no ✕ */}
			<DialogContent className="sm:max-w-md" hideCloseButton>
				<DialogTitle>This topic is invite-only</DialogTitle>
				<DialogDescription>
					{isSignedIn ? "Ask the topic owner for an invite to see it." : "Sign up to see it."}
				</DialogDescription>
				<DialogFooter>
					{isSignedIn ? (
						// the only action a signed-in user has here is leaving
						<Button onClick={() => navigate("/")}>Back to CarlNotes</Button>
					) : (
						<GatedSignedOutActions returnPath={returnPath} ctaTag={ctaTag} />
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// the signed-out visitor's call-to-action links, which return to this topic after login or signup
function GatedSignedOutActions({ returnPath, ctaTag }: { returnPath: string; ctaTag: string }) {
	return (
		<>
			<AnchorLink href={`/login${returnPath}`} className={buttonVariants({ variant: "outline" })}>
				Log in
			</AnchorLink>
			{/* cta names the arrival for the signup_completed event */}
			<AnchorLink href={`/signup${returnPath}&cta=${ctaTag}`} className={buttonVariants({ variant: "default" })}>
				Sign up
			</AnchorLink>
		</>
	)
}

// a section that stays hidden until scrolled into findingFilter, then plays the staggered hydrate animation
function HydrateSection({ index, children }: { index: number; children: React.ReactNode }) {
	const { ref, isVisible } = useIsVisible<HTMLDivElement>()
	return (
		<div
			ref={ref}
			className={cn(
				isVisible ? "animate-hydrate" : "opacity-0",
				"motion-reduce:animate-none motion-reduce:opacity-100",
			)}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{children}
		</div>
	)
}
