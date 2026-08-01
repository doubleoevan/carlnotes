import type { TopicResponse } from "@shared/contracts"
import { Bell, Pencil, Trash2 } from "lucide-react"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { Badge } from "@/components/primitives/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { DeleteTopicDialog } from "@/components/topic/DeleteTopicDialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { NewCountInfo } from "@/components/topic/Topic"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { TopicScanButton } from "@/components/topic/TopicScanButton"
import { TopicScanHistory } from "@/components/topic/TopicScanHistory"
import { TopicSettingsCard } from "@/components/topic/TopicSettingsCard"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { useIsVisible } from "@/hooks/useIsVisible"
import { authClient } from "@/lib/authClient"
import {
	fetchTopicPage,
	sendManualScan,
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
	sendTopicSubscription,
} from "@/lib/topicClient"
import { cn, matchesFeedView, NEXT_SCAN_DISCLAIMER, toFilteredFindings, toSubscribeTooltip } from "@/lib/utils"
import { type TopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"

// how often to re-fetch the page while a scan is running, so history and the manual scan button follow it live
const SCAN_POLL_MS = 3000
// a scan still running past this age is treated as stalled, so a crash-orphaned scan never polls or disables the button forever
const SCAN_STALE_MS = 5 * 60 * 1000

/**
 * The page for a single topic at /topics/:id: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { id = "" } = useParams()
	const navigate = useNavigate()
	// the session gates the subscribe bell: a visitor is sent to signup instead
	const { data: session } = authClient.useSession()
	// the shared feed state carries the homepage reload plus the view, sort, and resource kind filters this page honors
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
	useEffect(() => {
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

	// trigger a manual scan. isRunningScan shows the state until the new scan row appears in a reload.
	const handleManualScan = async (): Promise<void> => {
		if (!topicResponse) {
			return
		}
		startScan()
		try {
			const manualScansRemaining = await sendManualScan(topicResponse.id)
			if (manualScansRemaining === null) {
				// the request was rejected outright, so no scan ever started
				stopScan()
				return
			}
			await reloadTopicPage()
		} catch (error) {
			console.error("manual scan failed", error)
			stopScan()
		}
	}

	// a saved edit reloads this page and the homepage feed behind it
	const handleTopicSaved = async (): Promise<void> => {
		setIsEditOpen(false)
		await reloadTopicPage()
		await reloadHomePage()
	}

	// the findings filtered by resource kind and the active view, with bookmarked rows pinned first
	const filteredFindings = toFilteredFindings(
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

	// the manual scan block shows optimistically while loading before checking ownership
	const isManualScanShown =
		topicResponse === undefined || (topicResponse?.isOwner && topicResponse.manualScansRemaining !== null)
	return (
		<main className="mx-auto max-w-5xl px-safe pt-3 pb-8">
			{/* the static control row: it renders before the payload, so the chrome never jumps or animates in. wraps when the screen is too narrow */}
			<div className="mb-3 flex flex-wrap items-start justify-between gap-3">
				<TopicFeedSort sort={sort} onChange={setSort} />
				{isManualScanShown && (
					<TopicScanButton
						remainingScans={topicResponse?.manualScansRemaining ?? null}
						isSpendExhausted={topicResponse?.isSpendExhausted ?? false}
						isRunning={isRunningScan || isScanning}
						onManualScan={handleManualScan}
					/>
				)}
			</div>

			{/* link back to the homepage and the topic actions */}
			<div className="flex items-center justify-between gap-3">
				<AnchorLink href="/" className="text-link text-sm hover:underline">
					← All topics
				</AnchorLink>
				{topicResponse && (
					<HeaderActions
						topic={topicResponse}
						isSignedIn={Boolean(session)}
						onEdit={() => setIsEditOpen(true)}
						onDelete={() => setIsDeleteOpen(true)}
						onSubscriptionToggle={handleSubscriptionToggle}
					/>
				)}
			</div>

			{/* the loading skeleton, the not-found line, or the hydrating topic sections */}
			{topicResponse === undefined && <TopicSkeleton />}
			{topicResponse === null && (
				<p className="text-muted-foreground mt-6 text-sm">{"Carl couldn't find this topic. He checked twice."}</p>
			)}
			{topicResponse && (
				<>
					{/* the topic header: the title with its unread count, then the tags */}
					<HydrateSection index={0}>
						<TopicHeader page={topicResponse} />
					</HydrateSection>

					{/* findings, full width, narrowed by the view filters. the view key replays the entrance when they change */}
					<HydrateSection key={viewKey} index={1}>
						<TopicFindingsSection
							topicFindings={filteredFindings}
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
				</>
			)}
		</main>
	)
}

// re-fetch the topic page on an interval while any of its scans are running,
// so the history status row and the "Brew now" button follow a scan to completion without a manual reload.
function usePollWhileScanning(isScanning: boolean, reload: () => Promise<void>): void {
	useEffect(() => {
		if (!isScanning) {
			return
		}

		// poll until the running scan resolves, then the cleared interval lets the page rest
		const interval = setInterval(() => {
			void reload()
		}, SCAN_POLL_MS)
		return () => clearInterval(interval)
	}, [isScanning, reload])
}

// the topic header: the title with its unread count, then its tags. the owner and subscriber actions
// live on the back-link line above, since they need the same far-right alignment on every load state
function TopicHeader({ page }: { page: TopicResponse }) {
	return (
		<>
			{/* title row. the top margin seats the title level with the homepage's first section heading */}
			<div className="mt-10 flex items-start justify-between gap-3">
				<h1 className="font-display min-w-0 text-2xl leading-tight">{page.name}</h1>
				{page.newCount > 0 && <NewCountInfo topic={page} />}
			</div>
			{/* tags row */}
			<div className="mt-2 flex flex-wrap gap-1">
				{page.tags.map((tag) => (
					<Badge key={tag} variant="secondary">
						{tag}
					</Badge>
				))}
			</div>
		</>
	)
}

// the edit delete and subscribe actions
function HeaderActions({
	topic,
	isSignedIn,
	onEdit,
	onDelete,
	onSubscriptionToggle,
}: {
	topic: TopicResponse
	isSignedIn: boolean
	onEdit: () => void
	onDelete: () => void
	onSubscriptionToggle: () => void
}) {
	const subscribeTooltip = toSubscribeTooltip(isSignedIn, topic.isSubscribed, topic.visibility === "invite")
	return (
		<div className="flex items-center gap-0.5">
			{topic.isOwner && (
				<IconButton tooltip="Edit this topic" onClick={onEdit}>
					<Pencil className="size-3.75" />
				</IconButton>
			)}
			{topic.isOwner && (
				<IconButton tooltip="Delete this topic" onClick={onDelete}>
					<Trash2 className="size-3.75" />
				</IconButton>
			)}
			{!topic.isOwner && topic.visibility !== "private" && (
				<IconButton tooltip={subscribeTooltip} isPressed={topic.isSubscribed} onClick={onSubscriptionToggle}>
					<Bell className={cn("size-3.75", topic.isSubscribed && "text-primary fill-current")} />
				</IconButton>
			)}
		</div>
	)
}

// a section that stays hidden until scrolled into view, then plays the staggered hydrate animation
function HydrateSection({ index, children }: { index: number; children: React.ReactNode }) {
	const { ref, isVisible } = useIsVisible<HTMLDivElement>()
	return (
		<div
			ref={ref}
			className={isVisible ? "animate-hydrate" : "opacity-0"}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{children}
		</div>
	)
}

// an icon with an action tooltip
function IconButton({
	tooltip,
	isPressed,
	onClick,
	children,
}: {
	tooltip: string
	isPressed?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={tooltip}
					aria-pressed={isPressed}
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground grid size-11 place-items-center sm:size-7"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

// whether a scan started recently enough to still be genuinely running, versus stalled by a crash
function isRecentScan(startedAt: string): boolean {
	return Date.now() - new Date(startedAt).getTime() < SCAN_STALE_MS
}

// the manual scan button's live state. isScanning is a recent running row, and isRunningScan is optimistic from
// the click until a row started after it appears in any status, so a fast failure never leaves the button stuck
function useManualScanProgress(scans: TopicResponse["scans"] | undefined): {
	isScanning: boolean
	isRunningScan: boolean
	startScan: () => void
	stopScan: () => void
} {
	const [isRunningScan, setIsRunningScan] = useState(false)
	const [scanTriggeredAt, setScanTriggeredAt] = useState<number | null>(null)

	const isScanning = scans?.some((scan) => scan.status === "running" && isRecentScan(scan.startedAt)) ?? false
	const hasScanSinceTrigger =
		scanTriggeredAt !== null && (scans?.some((scan) => new Date(scan.startedAt).getTime() >= scanTriggeredAt) ?? false)

	// hand the button over from the optimistic flag to the visible row
	useEffect(() => {
		if (isScanning || hasScanSinceTrigger) {
			setIsRunningScan(false)
		}
	}, [isScanning, hasScanSinceTrigger])

	return {
		isScanning,
		isRunningScan,
		startScan: () => {
			setIsRunningScan(true)
			setScanTriggeredAt(Date.now())
		},
		stopScan: () => setIsRunningScan(false),
	}
}
