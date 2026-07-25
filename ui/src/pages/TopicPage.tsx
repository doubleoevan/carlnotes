import type { TopicResponse } from "@shared/contracts"
import { ADMIN_QUOTA } from "@shared/plans"
import { Bell, Pencil, Play, Trash2 } from "lucide-react"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AnchorLink } from "@/components/AnchorLink"
import { Badge } from "@/components/primitives/badge"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { DeleteTopicDialog } from "@/components/topic/DeleteTopicDialog"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { ScanHistory } from "@/components/topic/ScanHistory"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { TopicSkeleton } from "@/components/topic/TopicSkeleton"
import { NewCountInfo } from "@/components/topic-feed/Topic"
import { UnreadToggle } from "@/components/UnreadToggle"
import { useIsVisible } from "@/hooks/useIsVisible"
import {
	fetchTopicPage,
	sendManualScan,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
	sendTopicSubscription,
} from "@/lib/topicClient"
import { cn } from "@/lib/utils"
import { type TopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"

// how often to re-fetch the page while a scan is running, so history and the run-now button follow it live
const SCAN_POLL_MS = 3000
// a scan still running past this age is treated as stalled, so a crash-orphaned scan never polls or disables run-now forever
const SCAN_STALE_MS = 5 * 60 * 1000

/**
 * The page for a single topic at /topics/:id: header with owner actions, findings, scan history, and the info card.
 */
export function TopicPage() {
	const { id = "" } = useParams()
	const navigate = useNavigate()
	// the shared feed state carries the homepage reload plus the "All" "Unread" and resource kind filters this page honors
	const { reload: reloadHomepageFeed, showAll, setShowAll, resourceKinds } = useTopicFeed()
	// the topic page payload. undefined while loading, null when missing or not visible
	const [topicResponse, setTopicResponse] = useState<TopicResponse | null | undefined>(undefined)
	// which dialog is open, and whether a manual scan request is in-flight
	const [isEditOpen, setIsEditOpen] = useState(false)
	const [isDeleteOpen, setIsDeleteOpen] = useState(false)
	const [isRunningScan, setIsRunningScan] = useState(false)

	// reload the page payload when the topic id changes
	const reload = useCallback(async () => {
		try {
			setTopicResponse(await fetchTopicPage(id))
		} catch (error) {
			console.error("topic page load failed", error)
			setTopicResponse(null)
		}
	}, [id])
	useEffect(() => {
		void reload()
	}, [reload])

	// reload the page after running a topic feed handler
	const runThenReload = useCallback(
		async (handler: () => Promise<void>) => {
			try {
				await handler()
				await reload()
			} catch (error) {
				console.error("topic action failed", error)
			}
		},
		[reload],
	)
	const handlers: TopicFeedHandlers = useMemo(
		() => ({
			open: (findingId) => runThenReload(() => sendTopicFindingOpened(findingId)),
			consume: (findingId, isConsumed) => runThenReload(() => sendTopicFindingConsumed(findingId, isConsumed)),
			rate: (findingId, rating) => runThenReload(() => sendTopicFindingRating(findingId, rating)),
		}),
		[runThenReload],
	)

	// toggle this user's subscription
	const handleSubscriptionToggle = async () => {
		if (!topicResponse) {
			return
		}
		await runThenReload(() => sendTopicSubscription(topicResponse.id, !topicResponse.isSubscribed))
	}

	// trigger a manual scan, then reload the page so the quota line and the running scan show
	const handleRunNow = async () => {
		if (!topicResponse) {
			return
		}
		setIsRunningScan(true)
		await runThenReload(() => sendManualScan(topicResponse.id).then(() => {}))
		setIsRunningScan(false)
	}

	// a saved edit reloads this page and the homepage feed behind it
	const handleSaved = async () => {
		setIsEditOpen(false)
		await reload()
		await reloadHomepageFeed()
	}

	// the findings filtered by the selected resource kinds
	const filteredFindings = (topicResponse?.findings ?? []).filter(
		(finding) => resourceKinds.has(finding.resourceKind) && (showAll || !finding.isConsumed),
	)
	// a filter change remounts the findings section so its hydrate entrance replays using a view key
	const viewKey = `${showAll}-${[...resourceKinds].sort().join()}`

	// a scan is live when a recent history row is still running which triggers the page reload polling
	const isScanning =
		topicResponse?.scans.some((scan) => scan.status === "running" && isRecentScan(scan.startedAt)) ?? false
	usePollWhileScanning(isScanning, reload)

	// the run-now block shows optimistically while loading before checking ownership
	const isRunNowShown =
		topicResponse === undefined ||
		(topicResponse !== null && topicResponse.isOwner && topicResponse.manualScansRemaining !== null)
	return (
		<main className="mx-auto max-w-5xl px-safe py-8">
			{/* the static control row: it renders before the payload, so the chrome never jumps or animates in */}
			<div className="mb-3 flex items-start justify-between gap-3">
				<UnreadToggle showAll={showAll} onChange={setShowAll} />
				{isRunNowShown && (
					<RunNowBlock
						remainingScans={topicResponse?.manualScansRemaining ?? null}
						isRunning={isRunningScan || isScanning}
						onRunNow={handleRunNow}
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

					{/* history left, the info card right */}
					<HydrateSection index={2}>
						<div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_32rem]">
							<ScanHistory scans={topicResponse.scans} />
							<TopicInfoCard topic={topicResponse} />
						</div>
					</HydrateSection>

					{/* the owner dialogs, mounted only while open so their state resets each time */}
					{isEditOpen && (
						<EditTopicModal topic={topicResponse} onClose={() => setIsEditOpen(false)} onTopicSaved={handleSaved} />
					)}
					{isDeleteOpen && (
						<DeleteTopicDialog
							topic={topicResponse}
							onClose={() => setIsDeleteOpen(false)}
							onTopicDeleted={async () => {
								await reloadHomepageFeed()
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
// so the history status row and the "Run now" button follow a scan to completion without a manual reload.
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

// the "Run now" button and remaining scans or its running animation
function RunNowBlock({
	remainingScans,
	isRunning,
	onRunNow,
}: {
	remainingScans: number | null
	isRunning: boolean
	onRunNow: () => void
}) {
	return (
		<div className="flex shrink-0 flex-col items-end gap-0.5">
			{/* while a scan runs the trigger becomes a bigger shimmering "Carl is reading", held at the button's height so the row never jumps */}
			{isRunning ? (
				<div className="flex min-h-11 items-center sm:min-h-9">
					<span className="shimmer-text text-base font-semibold sm:text-lg">Carl is reading…</span>
				</div>
			) : (
				<Button
					variant="secondary"
					size="sm"
					onClick={onRunNow}
					disabled={remainingScans === null || remainingScans <= 0}
					className="min-h-11 gap-1.5 rounded-lg sm:min-h-9"
				>
					<Play className="size-4 fill-none" />
					Run now
				</Button>
			)}
			{/* the quota line hydrates in once the payload lands, right-indented to end at the button text above */}
			<RemainingScans remainingScans={remainingScans} />
		</div>
	)
}

// the remaining scans
function RemainingScans({ remainingScans }: { remainingScans: number | null }) {
	if (remainingScans === null) {
		return <div aria-hidden="true" className="bg-muted mr-2.5 h-4 w-16 animate-pulse rounded" />
	}
	if (remainingScans >= ADMIN_QUOTA) {
		return <span className="text-muted-foreground animate-hydrate mr-2.5 text-xs">Unlimited</span>
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href="/pricing" className="text-link animate-hydrate mr-2.5 text-xs hover:underline">
					{remainingScans} left today
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent side="bottom">Upgrade for more</TooltipContent>
		</Tooltip>
	)
}

// the edit delete and subscribe actions
function HeaderActions({
	topic,
	onEdit,
	onDelete,
	onSubscriptionToggle,
}: {
	topic: TopicResponse
	onEdit: () => void
	onDelete: () => void
	onSubscriptionToggle: () => void
}) {
	return (
		<div className="flex items-center gap-0.5">
			{topic.isOwner && (
				<IconButton label="Edit topic" onClick={onEdit}>
					<Pencil className="size-3.75" />
				</IconButton>
			)}
			{topic.isOwner && (
				<IconButton label="Delete topic" onClick={onDelete}>
					<Trash2 className="size-3.75" />
				</IconButton>
			)}
			{!topic.isOwner && topic.visibility !== "private" && (
				<IconButton
					label={topic.isSubscribed ? "Unsubscribe" : "Subscribe"}
					isPressed={topic.isSubscribed}
					onClick={onSubscriptionToggle}
				>
					<Bell className={cn("size-3.75", topic.isSubscribed && "fill-current")} />
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
	label,
	isPressed,
	onClick,
	children,
}: {
	label: string
	isPressed?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={isPressed}
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground grid size-11 place-items-center sm:size-7"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

// whether a scan started recently enough to still be genuinely running, versus stalled by a crash
function isRecentScan(startedAt: string): boolean {
	return Date.now() - new Date(startedAt).getTime() < SCAN_STALE_MS
}
