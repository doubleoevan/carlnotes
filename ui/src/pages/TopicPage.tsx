import type { TopicResponse } from "@shared/contracts"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { DeleteTopicDialog } from "@/components/topic/DeleteTopicDialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { ShareTopic } from "@/components/topic/ShareTopic"
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
	// which dialog is open, and whether a manual scan request is in-flight
	const [isEditOpen, setIsEditOpen] = useState(false)
	const [isDeleteOpen, setIsDeleteOpen] = useState(false)
	const { isScanning, isRunningScan, startScan, stopScan } = useManualScanProgress(topicResponse?.scans)

	// reload the page payload when the topic id changes
	const reloadTopicPage = useCallback(async () => {
		try {
			setTopicResponse(await fetchTopicPage(id))
		} catch (error) {
			console.error("topic page load failed", error)
			setTopicResponse(null)
		}
	}, [id])
	// clearing first falls back to the skeleton, so moving between topics never leaves the previous topic's
	// findings on screen. only the id changes this, so a reload after a handler updates in place instead
	useEffect(() => {
		setTopicResponse(undefined)
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
			open: (findingId) => runThenReload(() => sendTopicFindingOpened(findingId)),
			consume: (findingId, isConsumed) => runThenReload(() => sendTopicFindingConsumed(findingId, isConsumed)),
			rate: (findingId, rating) => runThenReload(() => sendTopicFindingRating(findingId, rating)),
			bookmark: (findingId, isBookmarked) => runThenReload(() => sendTopicFindingBookmark(findingId, isBookmarked)),
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
		setIsEditOpen(false)
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
					{/* sharing sits beside following, since both are things a user does with someone else's topic.
					    a private topic has nowhere a reader could follow the link to */}
					{topicResponse && topicResponse.visibility !== "private" && (
						<ShareTopic
							topicId={topicResponse.id}
							topicName={topicResponse.name}
							isPublic={topicResponse.visibility === "public"}
							className={MENU_BUTTON_CLASS}
						/>
					)}
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

			{/* the loading skeleton, the not-found line, or the hydrating topic sections */}
			{topicResponse === undefined && <TopicSkeleton />}
			{topicResponse === null && (
				<p className="text-muted-foreground mt-6 text-sm">{"Carl couldn't find this topic. He checked twice."}</p>
			)}
			{topicResponse && (
				<>
					{/* the topic header: the title with its unread count and owner actions, then the tags */}
					<HydrateSection index={0}>
						<TopicHeader
							topic={topicResponse}
							onEdit={() => setIsEditOpen(true)}
							onDelete={() => setIsDeleteOpen(true)}
						/>
					</HydrateSection>

					{/* findings, full width, narrowed by the view filters. the view key replays the entrance when they change */}
					<HydrateSection key={viewKey} index={1}>
						<TopicFindingsSection
							topicFindings={visibleFindings}
							hasAnyFindings={topicResponse.findings.length > 0}
							isRatable={topicResponse.canRate}
							handlers={handlers}
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
								/>
								<TopicSettingsCard topic={topicResponse} />
							</div>
							<TopicInfoCard topic={topicResponse} />
						</div>
					</HydrateSection>

					{/* the owner dialogs, mounted only while open so their state resets each time */}
					{isEditOpen && (
						<EditTopicModal
							topic={topicResponse}
							onClose={() => setIsEditOpen(false)}
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
