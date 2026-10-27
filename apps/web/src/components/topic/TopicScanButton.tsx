import { type FetchTopicPageOptions, sendManualScan, sendStopScan } from "@carlnotes/client/topicClient"
import { ADMIN_QUOTA } from "@carlnotes/contracts/plans"
import {
	FIRST_SCAN_PAUSED_REASON,
	isBudgetError,
	MANUAL_SCAN_PAUSED_LABEL,
	SCAN_SPENT_BUDGET_LABEL,
	toScanFailureLabel,
} from "@carlnotes/contracts/scanFailure"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { isManualScanShown } from "@carlnotes/core/lib/topicActions"
import { cn } from "@carlnotes/nightshift/classNames"
import { type UseNavigateResult, useNavigate } from "@tanstack/react-router"
import { CirclePause, Coffee } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { IconButton } from "@/components/common/IconButton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useManualScanProgress, usePollWhileScanning } from "@/hooks/useTopicScan"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS, RAIL_ICON_INSET } from "@/lib/styleClasses"
import { toSeeAccountToastAction, toSeePlansToastAction } from "@/lib/toastActions"

// how long after a scan finishes the page keeps looking for the podcast episode that the scan starts
const PODCAST_EPISODE_START_WAIT_MS = 90_000

// whether a podcast episode of this topic is recording, or its latest scan just finished and may still start an episode
function isPodcastEpisodePending(topic: TopicResponse | null | undefined): boolean {
	// a topic with no podcast has no episode pending, and a recording episode is pending
	const topicPodcast = topic?.podcast
	if (!topic || !topicPodcast) {
		return false
	}
	if (topicPodcast.unpublishedPodcastEpisode?.status === "recording") {
		return true
	}

	// the latest scan succeeded within the wait with no podcast episode yet, on a topic whose podcast is on
	const [latestScan] = topic.scans
	const elapsedSinceScanMs = latestScan?.finishedAt ? Date.now() - new Date(latestScan.finishedAt).getTime() : null
	const isScanAwaitingPodcastEpisode =
		latestScan?.status === "succeeded" &&
		!latestScan.podcastEpisode &&
		elapsedSinceScanMs !== null &&
		elapsedSinceScanMs < PODCAST_EPISODE_START_WAIT_MS
	return topicPodcast.isEnabled && isScanAwaitingPodcastEpisode
}

export { isManualScanShown } from "@carlnotes/core/lib/topicActions"

/**
 * The topic page's Brew control: the button in its running, blocked, or ready state, the sends for it,
 * and the poll that keeps the page live while a scan of this topic runs. It mounts for every user so a
 * anyone watching someone else's scan sees the history fill in, and renders nothing unless this user may brew.
 */
export function TopicScanButton({
	topic,
	onScanned,
	shouldPollTopicPage = true,
	scanHint,
}: {
	topic: TopicResponse | null | undefined
	onScanned: (fetchTopicPageOptions?: FetchTopicPageOptions) => Promise<void>
	// whether this button runs the page's poll and the scan failure toast
	shouldPollTopicPage?: boolean
	// the words after the scan button, which hide while a scan runs
	scanHint?: string
}) {
	const navigate = useNavigate()
	const { isScanning, isRunningScan, isCancellingScan, startScan, stopScan, cancelScan, stopCancelling } =
		useManualScanProgress(topic?.scans)

	// poll from the click, before the scan row arrives, and while the scan's podcast episode records.
	// the reload function stays the same across renders, so the poll does not restart and the poll's delay can grow
	const reloadTopicPageAsPoll = useCallback(() => onScanned({ isPoll: true }), [onScanned])
	// ponytail: a podcast episode on the flex tier can record for hours,
	// and the page polls every 30 seconds the whole time. slow the poll during a long recording if those reads add load
	usePollWhileScanning(
		shouldPollTopicPage && (isScanning || isRunningScan || isPodcastEpisodePending(topic)),
		reloadTopicPageAsPoll,
	)
	// a scan that fails while the user is on the page shows the failure
	useScanFailureToast(shouldPollTopicPage ? topic?.scans : undefined)

	// trigger a scan. the optimistic flag holds the running state until the new scan row arrives in a reload.
	// a scan rejected because of the budget or the manual scans cutoff clears the optimistic flag and says why
	const handleManualScan = async (): Promise<void> => {
		if (!topic) {
			return
		}
		startScan()
		await runTopicScan({
			send: async () => {
				const sendManualScanResult = await sendManualScan(topic.id)
				if (sendManualScanResult === "budget") {
					stopScan()
					showSpentBudgetToast(navigate)
				} else if (sendManualScanResult === "paused") {
					stopScan()
					showManualScanPausedToast(navigate)
				}
			},
			reloadTopicFeed: onScanned,
			revert: stopScan,
			logLabel: "manual scan failed",
			fallbackMessage: "The raccoon got that one. Carl suggests you put another pot on.",
		})
	}

	// cancel the running scan. the scan keeps what it already collected, and the scan limit slot is given back
	const handleCancelScan = async (): Promise<void> => {
		if (!topic) {
			return
		}
		cancelScan()
		await runTopicScan({
			send: () => sendStopScan(topic.id),
			reloadTopicFeed: onScanned,
			// the scan is still going. the stop icon comes back
			revert: stopCancelling,
			logLabel: "stopping the scan failed",
			fallbackMessage: "Carl didn't catch that. That brew is still going.",
		})
	}

	// a user who may not brew keeps only the poll above
	if (!topic || !isManualScanShown(topic)) {
		return null
	}
	const { manualScansRemaining, manualScanLimit, isManualScanPaused, isSpendExhausted } = topic

	// while a scan runs, the trigger becomes a bigger shimmering "Carl is Brewing" with the cancel icon to the right
	if (isRunningScan || isScanning) {
		return (
			<div className={cn(RAIL_ICON_INSET, "flex min-h-11 items-center gap-1 sm:min-h-9")}>
				<span className="shimmer-text text-base font-semibold sm:text-lg">Carl is Brewing…</span>
				{/* only a scan with a row to cancel may be stopped, and the icon disappears once clicked */}
				{isScanning && !isCancellingScan && (
					<IconButton tooltip="Stop this Brew" onClick={handleCancelScan}>
						<CirclePause className="size-3.75" />
					</IconButton>
				)}
			</div>
		)
	}

	// an empty daily quota, a spend past the manual scans cutoff, and a spent budget each block the scan button, which
	// stays clickable to show what ran out. the two budget stops link the account page, and the daily quota the plans
	// page
	const isBudgetBlocked = isManualScanPaused || isSpendExhausted
	const isScanBlocked = manualScansRemaining !== null && (manualScansRemaining <= 0 || isBudgetBlocked)
	if (isScanBlocked) {
		const blockedLine = toBlockedScanLine(topic)
		return (
			<>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() =>
								toast(blockedLine, {
									action: isBudgetBlocked ? toSeeAccountToastAction(navigate) : toSeePlansToastAction(navigate),
								})
							}
							className={cn(MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS)}
						>
							<Coffee className="size-4 fill-none" />
							Brew
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{blockedLine}</TooltipContent>
				</Tooltip>
				{/* the scan hint */}
				{scanHint}
			</>
		)
	}

	// the scan button stays disabled until the day's remaining scan count loads
	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleManualScan}
						disabled={manualScansRemaining === null}
						className={cn(
							MENU_BUTTON_CLASS,
							MENU_BUTTON_HIGHLIGHT_CLASS,
							"disabled:pointer-events-none disabled:opacity-50",
						)}
					>
						<Coffee className="size-4 fill-none" />
						Brew
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					Scan this topic for new findings
					{manualScansRemaining !== null && manualScanLimit !== null && (
						<span className="block">
							{manualScanLimit >= ADMIN_QUOTA
								? "Unlimited scans"
								: `${manualScansRemaining} of ${manualScanLimit} daily scans left`}
						</span>
					)}
				</TooltipContent>
			</Tooltip>
			{/* the scan hint */}
			{scanHint}
		</>
	)
}

// the line of a blocked scan. a spent budget comes first, since it stops scheduled scans too, then the manual scans
// cutoff, then the used up daily quota
function toBlockedScanLine({
	isSpendExhausted,
	isManualScanPaused,
}: Pick<TopicResponse, "isSpendExhausted" | "isManualScanPaused">): string {
	if (isSpendExhausted) {
		return "You are out of budget this month."
	}
	return isManualScanPaused ? MANUAL_SCAN_PAUSED_LABEL : "You have used today's brews."
}

/**
 * Announce a scan that fails while the page is open. Only a scan that fails after this mounts is announced,
 * so opening a topic never replays an old failure.
 */
function useScanFailureToast(scans: TopicResponse["scans"] | undefined): void {
	const navigate = useNavigate()
	// the failures already announced, seeded with the ones on the page when it opened
	const announcedScanIds = useRef<Set<string> | null>(null)
	useEffect(() => {
		if (!scans) {
			return
		}
		const failedScans = scans.filter((scan) => scan.status === "failed")
		// the first pass records what was already failed instead of announcing it
		if (announcedScanIds.current === null) {
			announcedScanIds.current = new Set(failedScans.map((scan) => scan.id))
			return
		}
		for (const failedScan of failedScans) {
			if (announcedScanIds.current.has(failedScan.id)) {
				continue
			}
			announcedScanIds.current.add(failedScan.id)
			// a spent budget and the manual scans cutoff are the failures the user can do something about
			if (isBudgetError(failedScan.error)) {
				showSpentBudgetToast(navigate)
				continue
			}
			if (failedScan.error === FIRST_SCAN_PAUSED_REASON) {
				showManualScanPausedToast(navigate)
				continue
			}
			toast.error(toScanFailureLabel(failedScan.error))
		}
	}, [scans, navigate])
}

// show the budget toast with its See plans action, which opens the plans page. the id makes a second budget toast
// replace the first
function showSpentBudgetToast(navigate: UseNavigateResult<string>): void {
	toast.error(SCAN_SPENT_BUDGET_LABEL, { id: "spent-budget", action: toSeePlansToastAction(navigate) })
}

// show the manual scans cutoff toast with its See account action, which opens the account page. the cutoff is a
// planned pause, so the toast is plain
function showManualScanPausedToast(navigate: UseNavigateResult<string>): void {
	toast(MANUAL_SCAN_PAUSED_LABEL, { action: toSeeAccountToastAction(navigate) })
}

/**
 * One scan control's send, shared by starting a scan and stopping one. The caller flips its optimistic
 * state first, and a rejected send puts that state back with a toast.
 */
async function runTopicScan({
	send,
	reloadTopicFeed,
	revert,
	logLabel,
	fallbackMessage,
}: {
	send: () => Promise<unknown>
	reloadTopicFeed: () => Promise<void>
	revert: () => void
	logLabel: string
	// what the toast shows if the rejection has no message of its own
	fallbackMessage: string
}): Promise<void> {
	try {
		await send()
		await reloadTopicFeed()
	} catch (error) {
		console.error(logLabel, error)
		toast.error(error instanceof Error ? error.message : fallbackMessage)
		revert()
	}
}
