import { type TopicResponse, toCtaTag } from "@shared/contracts"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import {
	fetchTopicPage,
	sendTopicFeatureOrder,
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
	sendTopicSubscription,
} from "@/clients/topicClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { NotesSection } from "@/components/note/NotesSection"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { ShareTopic } from "@/components/share/ShareTopic"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { DeleteTopicDialog } from "@/components/topic/DeleteTopicDialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { NewCountInfo } from "@/components/topic/Topic"
import { isFollowInMenu, TopicActionBar, toTopicActionOptions } from "@/components/topic/TopicActions"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { TopicHeader } from "@/components/topic/TopicPageHeader"
import { type FeatureOrderMove, TopicRankDialog } from "@/components/topic/TopicRankDialog"
import { TopicScanButton } from "@/components/topic/TopicScanButton.tsx"
import { TopicScanHistory } from "@/components/topic/TopicScanHistory"
import { TopicSettingsCard } from "@/components/topic/TopicSettingsCard"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { useIsVisible } from "@/hooks/useIsVisible"
import { usePageTitle } from "@/hooks/usePageTitle"
import { matchesTopicFindingFilter } from "@/lib/topicFindingFilters"
import { toSortedTopicFindings } from "@/lib/topicFindingSorts"
import { cn, NEXT_SCAN_DISCLAIMER } from "@/lib/utils"
import { type TopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"
import { useRegisterChatContext } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// the page's dialogs, one open at a time
type TopicDialog = "edit" | "make-public" | "share" | "rank" | "delete"

/**
 * The page for a single topic at /topics/:id: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { id = "" } = useParams()
	const navigate = useNavigate()
	// the session gates the Follow button. a visitor's click is sent to signup instead
	const { data: session } = authClient.useSession()
	// the shared feed state includes the homepage reload plus the finding filter this page's action bar reads
	const { reloadTopicFeed: reloadHomePage, findingFilter } = useTopicFeed()
	// the topic page payload. undefined while loading, null if missing or not visible
	const [topic, setTopic] = useState<TopicResponse | null | undefined>(undefined)
	// how the topic is gated if this user may not see it, an invite topic's gate shows its name, a private topic
	const [gatedTopic, setGatedTopic] = useState<{ topicName: string | null } | null>(null)
	// the one dialog on screen, or null when none is open
	const [openDialog, setOpenDialog] = useState<TopicDialog | null>(null)
	usePageTitle(topic?.name ?? null)

	// the owning team a user on none of the topic's teams could join
	const joinTeam = topic?.roomTeams.length === 0 ? topic.teamLink : null
	const actionContext = {
		topic: topic,
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
								hasAvatar: joinTeam.hasAvatar,
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
					options: toTopicActionOptions({
						topic: topic,
						isAdmin: session?.user.role === "admin",
						isFollowInMenu: isFollowInMenu(actionContext),
						onShare: () => setOpenDialog("share"),
						onToggleFollow: () => void handleSubscriptionToggle(),
						onRank: () => setOpenDialog("rank"),
						onEdit: () => setOpenDialog("edit"),
						onDelete: () => setOpenDialog("delete"),
					}),
					report: { subjectKind: "topic", subjectId: topic.id, subjectLabel: topic.name },
				}
			: null,
	)

	// reload the page payload when the topic id changes
	const reloadTopicPage = useCallback(async () => {
		try {
			const topicPage = await fetchTopicPage(id)
			setTopic(topicPage.status === "visible" ? topicPage.topic : null)
			setGatedTopic(topicPage.status === "gated" ? { topicName: topicPage.topicName } : null)
		} catch (error) {
			console.error("topic page load failed", error)
			setTopic(null)
		}
	}, [id])
	// clearing first falls back to the skeleton
	useEffect(() => {
		setTopic(undefined)
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
	const topicHandlers: TopicFeedHandlers = useMemo(
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
		if (!topic) {
			return
		}
		// a visitor has to sign up before subscribing
		if (!session) {
			navigate("/signup?cta=subscribe")
			return
		}
		const isSubscribing = !topic.isSubscribed
		await runThenReload(() => sendTopicSubscription(topic.id, isSubscribing))
		// an invite topic only shows findings from the next scan onward, which the toast says out loud
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
					gatedTopic={gatedTopic}
					isSignedIn={Boolean(session)}
					topicId={id}
				/>
			)}
			{topic && (
				<>
					{/* the topic header: the title with its chat mention badge, then the tags */}
					<HydrateSection index={0}>
						<TopicHeader topic={topic} />
					</HydrateSection>
					<TopicFindings topic={topic} topicHandlers={topicHandlers} />
					<TopicCards topic={topic} onMakeTopicPublic={() => setOpenDialog("make-public")} />
					<TopicDialogs
						topic={topic}
						openDialog={openDialog}
						onOpenDialog={setOpenDialog}
						onSaveTopic={handleSaveTopic}
						onRankTopic={handleRankTopic}
						onTopicDeleted={async () => {
							await reloadHomePage()
							navigate("/")
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
		<HydrateSection key={viewKey} index={1}>
			<TopicFindingsSection
				topicFindings={topicFindings}
				hasAnyFindings={topic.findings.length > 0}
				isRatable={topic.canRate}
				isBookmarkable={topic.isOwner || topic.isTeamMember}
				handlers={topicHandlers}
				topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
				newCountInfo={topic.newCount > 0 ? <NewCountInfo topic={topic} /> : undefined}
			/>
		</HydrateSection>
	)
}

/**
 * The topic info card on the left, its scan history and settings on the right.
 */
function TopicCards({ topic, onMakeTopicPublic }: { topic: TopicResponse; onMakeTopicPublic: () => void }) {
	return (
		<HydrateSection index={2}>
			<div className="grid gap-x-8 lg:grid-cols-[32rem_minmax(0,1fr)]">
				<TopicInfoCard topic={topic} onMakeTopicPublic={onMakeTopicPublic} />
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
