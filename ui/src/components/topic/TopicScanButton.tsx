import { ADMIN_QUOTA } from "@shared/plans"
import { CirclePause, Coffee } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { IconButton } from "@/components/common/IconButton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS, RAIL_ICON_INSET } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * The topic page's Brew button in its running, blocked, or ready state, with the day's remaining scans in its tooltip.
 */
export function TopicScanButton({
	remainingScans,
	scanLimit,
	isSpendExhausted,
	isRunning,
	isCancelling,
	onManualScan,
	onCancelScan,
}: {
	remainingScans: number | null
	// the plan's daily limit, which the tooltip pairs with what is left
	scanLimit: number | null
	isSpendExhausted: boolean
	isRunning: boolean
	isCancelling: boolean
	onManualScan: () => void
	onCancelScan?: () => void
}) {
	// an empty daily quota and a spent budget both stop the brew
	const isScanBlocked = remainingScans !== null && (remainingScans <= 0 || isSpendExhausted)
	return (
		<TopicScanTrigger
			isScanRunning={isRunning}
			isScanBlocked={isScanBlocked}
			isScanDisabled={remainingScans === null}
			isSpendExhausted={isSpendExhausted}
			isScanCancelling={isCancelling}
			remainingScans={remainingScans}
			scanLimit={scanLimit}
			onManualScan={onManualScan}
			onCancelScan={onCancelScan}
		/>
	)
}

// the brew trigger in its three states: running, blocked, or ready
function TopicScanTrigger({
	isScanRunning,
	isScanBlocked,
	isScanDisabled,
	isSpendExhausted,
	isScanCancelling,
	remainingScans,
	scanLimit,
	onManualScan,
	onCancelScan,
}: {
	isScanRunning: boolean
	isScanBlocked: boolean
	isScanDisabled: boolean
	isSpendExhausted: boolean
	isScanCancelling: boolean
	remainingScans: number | null
	scanLimit: number | null
	onManualScan: () => void
	onCancelScan?: () => void
}) {
	const navigate = useNavigate()
	// while a scan runs, the trigger becomes a bigger shimmering "Carl is Brewing" with the cancel icon to the right
	if (isScanRunning) {
		return (
			<div className={cn(RAIL_ICON_INSET, "flex min-h-11 items-center gap-1 sm:min-h-9")}>
				<span className="shimmer-text text-base font-semibold sm:text-lg">Carl is Brewing…</span>
				{/* only whoever may scan may stop it. the icon disappears once clicked. */}
				{onCancelScan && !isScanCancelling && (
					<IconButton tooltip="Stop this Brew" onClick={onCancelScan}>
						<CirclePause className="size-3.75" />
					</IconButton>
				)}
			</div>
		)
	}

	// a blocked brew stays clickable and says what ran out, with the way to fix it in the toast's action
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
					onClick={onManualScan}
					disabled={isScanDisabled}
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
				{remainingScans !== null && scanLimit !== null && (
					<span className="block">
						{scanLimit >= ADMIN_QUOTA ? "Unlimited scans" : `${remainingScans} of ${scanLimit} daily scans left`}
					</span>
				)}
			</TooltipContent>
		</Tooltip>
	)
}
