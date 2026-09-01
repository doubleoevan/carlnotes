import type { TopicResponse } from "@shared/contracts"
import { ADMIN_QUOTA } from "@shared/plans"
import { isBudgetError, toScanFailureLabel } from "@shared/scanFailure"
import { CirclePause, Coffee } from "lucide-react"
import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { sendManualScan, sendStopScan } from "@/clients/topicClient"
import { IconButton } from "@/components/common/IconButton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useManualScanProgress, usePollWhileScanning } from "@/hooks/useTopicScan"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS, RAIL_ICON_INSET } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// whether this user may brew this topic. only an owner gets a remaining scan count in the payload
export function isManualScanShown(topic: TopicResponse | null | undefined): boolean {
	return topic?.manualScansRemaining != null
}

/**
 * The topic page's Brew control: the button in its running, blocked, or ready state, the sends for it,
 * and the poll that keeps the page live while a scan of this topic runs. It mounts for every user so a
 * anyone watching someone else's scan sees the history fill in, and renders nothing unless this user may brew.
 */
export function TopicScanButton({
	topic,
	onScanned,
}: {
	topic: TopicResponse | null | undefined
	onScanned: () => Promise<void>
}) {
	const navigate = useNavigate()
	const { isScanning, isRunningScan, isCancellingScan, startScan, stopScan, cancelScan, stopCancelling } =
		useManualScanProgress(topic?.scans)

	// polling starts on the click, before the scan row arrives
	usePollWhileScanning(isScanning || isRunningScan, onScanned)
	// a scan that fails while the user is on the page says so
	useScanFailureToast(topic?.scans, () => navigate("/plans"))

	// trigger a scan. the optimistic flag holds the running state until the new scan row arrives in a reload
	const handleManualScan = async (): Promise<void> => {
		if (!topic) {
			return
		}
		startScan()
		await runTopicScan({
			send: () => sendManualScan(topic.id),
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
	const { manualScansRemaining, manualScanLimit, isSpendExhausted } = topic

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

	// an empty daily quota and a spent budget both stop the brew, which stays clickable to say what ran out
	const isScanBlocked = manualScansRemaining !== null && (manualScansRemaining <= 0 || isSpendExhausted)
	if (isScanBlocked) {
		const blockedLine = isSpendExhausted ? "You are out of budget this month." : "You have used today's brews."
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() =>
							toast(blockedLine, {
								action: {
									label: isSpendExhausted ? "See account" : "See plans",
									onClick: () => navigate(isSpendExhausted ? "/account" : "/plans"),
								},
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
		)
	}

	// the brew button stays disabled until the day's remaining scan count loads
	return (
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
	)
}

/**
 * Announce a scan that fails while the page is open. Only a scan that fails after this mounts is announced,
 * so opening a topic never replays an old failure.
 */
function useScanFailureToast(scans: TopicResponse["scans"] | undefined, onSeePlans: () => void): void {
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
			// a spent budget is the one failure the user can do something about
			toast.error(toScanFailureLabel(failedScan.error), {
				action: isBudgetError(failedScan.error) ? { label: "See plans", onClick: onSeePlans } : undefined,
			})
		}
	}, [scans, onSeePlans])
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
	// what the toast says if the rejection has no message of its own
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
