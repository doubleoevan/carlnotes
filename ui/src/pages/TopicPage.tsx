import { type TopicResponse, toCtaTag } from "@shared/contracts"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { DeleteTopicDialog } from "@/components/topic/DeleteTopicDialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { TopicShareButton } from "@/components/topic/ShareTopic"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { SubscribeButton, TopicHeader } from "@/components/topic/TopicPageHeader"
import { TopicRankButton } from "@/components/topic/TopicRankButton"
import { TopicScanButton } from "@/components/topic/TopicScanButton"
import { TopicScanHistory } from "@/components/topic/TopicScanHistory"
import { TopicSettingsCard } from "@/components/topic/TopicSettingsCard"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { useIsVisible } from "@/hooks/useIsVisible"
import { useManualScanProgress, usePollWhileScanning } from "@/hooks/useTopicScan"
import { authClient } from "@/lib/authClient"
import {
	fetchTopicPage,
	type GatedVisibility,
	sendManualScan,
	sendTopicFeatureOrder,
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
	sendTopicSubscription,
} from "@/lib/topicClient"
import { cn, MENU_BUTTON_CLASS, matchesFeedView, NEXT_SCAN_DISCLAIMER, toSortedFindings } from "@/lib/utils"
import { type TopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"

/**
 * The page for a single topic at /topics/:id: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { id = "" } = useParams()
	const navigate = useNavigate()
	// the session gates the subscribe control. a visitor's click is sent to signup instead
	const { data: session } = authClient.useSession()
	// the shared feed state includes the homepage reload plus the view, sort, and resource filters
	const { reload: reloadHomePage, view, sort, setSort, resourceKinds } = useTopicFeed()
	// the topic page payload. undefined while loading, null when missing or not visible
	const [topicResponse, setTopicResponse] = useState<TopicResponse | null | undefined>(undefined)
	// how the topic is gated if this user may not see it, an invite topic's gate shows its name, a private topic shows nothing.
	const [gatedTopic, setGatedTopic] = useState<{ visibility: GatedVisibility; topicName: string | null } | null>(null)
	// which dialog is open, and whether a manual scan request is in-flight
	// how the edit modal opened, or null while it is closed. "make-public" stages the topic's visibility switch to "public" for review
	const [editMode, setEditMode] = useState<"edit" | "make-public" | null>(null)
	const [isDeleteOpen, setIsDeleteOpen] = useState(false)
	const { isScanning, isRunningScan, startScan, stopScan } = useManualScanProgress(topicResponse?.scans)

	// reload the page payload when the topic id changes
	const reloadTopicPage = useCallback(async () => {
		try {
			const topicPage = await fetchTopicPage(id)
			setTopicResponse(topicPage.status === "visible" ? topicPage.topic : null)
			setGatedTopic(
				topicPage.status === "gated" ? { visibility: topicPage.visibility, topicName: topicPage.topicName } : null,
			)
		} catch (error) {
			console.error("topic page load failed", error)
			setTopicResponse(null)
		}
	}, [id])
	// clearing first falls back to the skeleton, so moving between topics never leaves the previous topic's
	// findings on screen. only the id changes this, so a reload after a handler updates in place instead
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

	// toggle this user's subscription. show a toast to notify a user that they will see "invite" findings only after the next scan.
	const handleSubscriptionToggle = async (): Promise<void> => {
		if (!topicResponse) {
			return
		}
		// a visitor has to sign up before subscribing
		if (!session) {
			navigate("/signup?cta=subscribe")
			return
		}
		const isJoining = !topicResponse.isSubscribed
		await runThenReload(() => sendTopicSubscription(topicResponse.id, isJoining))
		if (isJoining && topicResponse.visibility === "invite") {
			toast(`You are subscribed.\n${NEXT_SCAN_DISCLAIMER}`)
		}
	}

	// ranking a topic shifts the other featured topic orders. the homepage feed reloads alongside this page's own control
	const handleTopicRank = async (topicId: string, position: number): Promise<void> => {
		await runThenReload(() => sendTopicFeatureOrder(topicId, position))
		await reloadHomePage()
	}

	// trigger a manual scan. isRunningScan shows the state until the new scan row appears in a reload.
	const handleManualScan = async (): Promise<void> => {
		if (!topicResponse) {
			return
		}
		startScan()
		try {
			await sendManualScan(topicResponse.id)
			await reloadTopicPage()
		} catch (error) {
			console.error("manual scan failed", error)
			toast.error(
				error instanceof Error ? error.message : "The raccoon got that one. Carl suggests you put another pot on.",
			)
			stopScan()
		}
	}

	// a saved edit reloads this page and the homepage feed behind it
	const handleTopicSaved = async (): Promise<void> => {
		setEditMode(null)
		await reloadTopicPage()
		await reloadHomePage()
	}

	// the findings this user sees: narrowed by resource kind and the active view, bookmarked rows pinned first
	const visibleFindings = toSortedFindings(
		(topicResponse?.findings ?? []).filter(
			(finding) => resourceKinds.has(finding.resourceKind) && matchesFeedView(finding, view),
		),
		sort,
	)
	// a filter change remounts the findings section so its hydrate entrance replays using a view key
	const viewKey = `${view}-${sort}-${[...resourceKinds].sort().join()}`

	// poll starts on the click itself, not just once the row is visible, so a reload that misses the
	// brand-new row still gets a retry a few seconds later instead of going quiet
	usePollWhileScanning(isScanning || isRunningScan, reloadTopicPage)

	// the manual scan block belongs to an owner with a quota, known only once the payload lands
	const isManualScanShown = topicResponse?.manualScansRemaining != null

	// the bottom padding clears the docked chat panel, so the last card can scroll out from under it
	return (
		<main className="mx-auto max-w-5xl px-safe pt-3 pb-28">
			{/* the static control row: it renders before the payload, so the chrome never jumps or animates in. wraps when the screen is too narrow */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<TopicFeedSort sort={sort} onChange={setSort} />
				{/* an admin arranges the Featured section from inside the topic itself. it only shows to an admin on a public topic */}
				{topicResponse && (
					<TopicRankButton topic={topicResponse} isAdmin={session?.user.role === "admin"} onRank={handleTopicRank} />
				)}
				{/* the right side holds the user's subscribe control and the owner's manual scan control.
				    while the page loads, a skeleton holds the slot */}
				<div className="flex items-start gap-2">
					{topicResponse === undefined && (
						<div
							aria-hidden="true"
							className="bg-muted h-11 w-28 animate-pulse rounded-lg motion-reduce:animate-none sm:h-9"
						/>
					)}
					{topicResponse && (
						<SubscribeButton topic={topicResponse} isSignedIn={Boolean(session)} onToggle={handleSubscriptionToggle} />
					)}
					{/* the share topic button */}
					{topicResponse && (
						<TopicShareButton
							topic={topicResponse}
							className={MENU_BUTTON_CLASS}
							onMakeTopicPublic={() => setEditMode("make-public")}
						/>
					)}
					{/* the scan topic Brew button */}
					{isManualScanShown && (
						<TopicScanButton
							remainingScans={topicResponse?.manualScansRemaining ?? null}
							isSpendExhausted={topicResponse?.isSpendExhausted ?? false}
							isRunning={isRunningScan || isScanning}
							onManualScan={handleManualScan}
						/>
					)}
				</div>
			</div>

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
				<>
					{/* the topic header: the title with its unread count and owner actions, then the tags */}
					<HydrateSection index={0}>
						<TopicHeader
							topic={topicResponse}
							onEdit={() => setEditMode("edit")}
							onDelete={() => setIsDeleteOpen(true)}
						/>
					</HydrateSection>

					{/* findings, full width, narrowed by the view filters. the view key replays the entrance when they change */}
					<HydrateSection key={viewKey} index={1}>
						<TopicFindingsSection
							topicFindings={visibleFindings}
							hasAnyFindings={topicResponse.findings.length > 0}
							isRatable={topicResponse.canRate}
							isBookmarkable={topicResponse.isOwner}
							handlers={handlers}
							topic={{ id: topicResponse.id, name: topicResponse.name, prompt: topicResponse.prompt }}
						/>
					</HydrateSection>

					{/* scan history over the blend on the left, the topic info card right */}
					<HydrateSection index={2}>
						<div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_32rem]">
							{/* a grid item sizes to its widest content unless told not to, so long urls inside these cards
							    would push the column past the viewport instead of truncating */}
							<div className="min-w-0">
								<TopicScanHistory
									scans={topicResponse.scans}
									allowedUrls={new Set(topicResponse.findings.map((finding) => finding.url))}
									findings={topicResponse.findings}
									topic={{ id: topicResponse.id, name: topicResponse.name, prompt: topicResponse.prompt }}
								/>
								<TopicSettingsCard topic={topicResponse} />
							</div>
							<TopicInfoCard topic={topicResponse} onMakeTopicPublic={() => setEditMode("make-public")} />
						</div>
					</HydrateSection>

					{/* the owner dialogs, mounted only while open so their state resets each time */}
					{editMode && (
						<EditTopicModal
							topic={topicResponse}
							isMakingTopicPublic={editMode === "make-public"}
							onClose={() => setEditMode(null)}
							onTopicSaved={handleTopicSaved}
						/>
					)}
					{isDeleteOpen && (
						<DeleteTopicDialog
							topic={topicResponse}
							onClose={() => setIsDeleteOpen(false)}
							onTopicDeleted={async () => {
								await reloadHomePage()
								navigate("/")
							}}
						/>
					)}

					{/* the docked chat panel */}
					<ChatPanel topicId={topicResponse.id} topicName={topicResponse.name} />
				</>
			)}
		</main>
	)
}

// what stands in for the topic: the skeleton while it loads,
// the skeleton behind the notice when this user may not see it,
// and a plain line when there is no such topic at all
function TopicPagePlaceholder({
	isLoading,
	gatedTopic,
	isSignedIn,
	topicId,
}: {
	isLoading: boolean
	gatedTopic: { visibility: GatedVisibility; topicName: string | null } | null
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
			<TopicGateNotice visibility={gatedTopic.visibility} isSignedIn={isSignedIn} topicId={topicId} />
		</>
	)
}

/**
 * What a user sees when they open a topic they don't have access to: the page's skeleton behind a notice.
 */
function TopicGateNotice({
	visibility,
	isSignedIn,
	topicId,
}: {
	visibility: GatedVisibility
	isSignedIn: boolean
	topicId: string
}) {
	const navigate = useNavigate()
	// the visibility notice for a topic that a user does not have access to
	const title = visibility === "invite" ? "This topic is invite-only" : "This topic is private"

	// offer the signup to a visitor who is logged-out
	const returnPath = `?next=${encodeURIComponent(`/topics/${topicId}`)}`
	// which arrival a signup gets attributed to for analytics
	const [searchParams] = useSearchParams()
	const ctaTag = toCtaTag(searchParams.get("src")) ?? "gate"
	return (
		<Dialog open onOpenChange={() => navigate("/")}>
			{/* no ✕: the gate's own actions are the ways out, logging in, signing up, or going back */}
			<DialogContent className="sm:max-w-md" hideCloseButton>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>
					{isSignedIn ? <GatedAskOwner visibility={visibility} /> : <GatedSignedOutLead visibility={visibility} />}
				</DialogDescription>
				<DialogFooter>
					{isSignedIn ? (
						// the only action a signed-in user has here is leaving
						<Button onClick={() => navigate("/")}>Back to CarlNotes</Button>
					) : (
						<GatedSignedOutActions visibility={visibility} returnPath={returnPath} ctaTag={ctaTag} />
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// what a signed-in user is told for a topic they don't have access to
function GatedAskOwner({ visibility }: { visibility: GatedVisibility }) {
	return visibility === "invite"
		? "Ask the topic owner for an invite to see it."
		: "Ask the topic owner to invite you to see it."
}

// what a signed-out user is told for a topic they don't have access to
function GatedSignedOutLead({ visibility }: { visibility: GatedVisibility }) {
	return visibility === "invite" ? "Sign up to see it." : "Log in to see it, if it's yours."
}

// the signed-out visitors call-to-action links returning back to this topic.
function GatedSignedOutActions({
	visibility,
	returnPath,
	ctaTag,
}: {
	visibility: GatedVisibility
	returnPath: string
	ctaTag: string
}) {
	if (visibility === "private") {
		return (
			<AnchorLink href={`/login${returnPath}`} className={buttonVariants({ variant: "default" })}>
				Log in
			</AnchorLink>
		)
	}
	return (
		<>
			<AnchorLink href={`/login${returnPath}`} className={buttonVariants({ variant: "outline" })}>
				Log in
			</AnchorLink>
			{/* cta names the arrival for the signup_completed event, the way the header and plans buttons do */}
			<AnchorLink href={`/signup${returnPath}&cta=${ctaTag}`} className={buttonVariants({ variant: "default" })}>
				Sign up
			</AnchorLink>
		</>
	)
}

// a section that stays hidden until scrolled into view, then plays the staggered hydrate animation
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
