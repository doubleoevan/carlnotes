import { ADMIN_QUOTA } from "@shared/plans"
import { Coffee } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ScanQuotaLink } from "@/components/topic/ScanQuotaLink.tsx"
import { cn, MENU_BUTTON_CLASS, RAIL_TEXT_INSET } from "@/lib/utils"

/**
 * The topic page's "Brew" control: the trigger in its running, blocked, or ready state, with the day's remaining scans below it.
 */
export function TopicScanButton({
	remainingScans,
	isSpendExhausted,
	isRunning,
	onManualScan,
}: {
	remainingScans: number | null
	isSpendExhausted: boolean
	isRunning: boolean
	onManualScan: () => void
}) {
	// an empty daily quota and a spent budget both stop the brew, and Activity is where either one is explained
	const isScanBlocked = remainingScans !== null && (remainingScans <= 0 || isSpendExhausted)
	return (
		<div className="flex shrink-0 flex-col items-end gap-0.5">
			<TopicScanTrigger
				isScanRunning={isRunning}
				isScanBlocked={isScanBlocked}
				isScanDisabled={remainingScans === null}
				isSpendExhausted={isSpendExhausted}
				onManualScan={onManualScan}
			/>
			{/* the quota line hydrates in once the payload lands. a blocked scan points at the account page like the trigger above,
			    otherwise the count links to the pricing page */}
			<ScanQuotaLink
				isLoading={remainingScans === null}
				// an unlimited daily quota still says so, unless the month's budget is what ran out
				isUnlimited={remainingScans !== null && remainingScans >= ADMIN_QUOTA && !isSpendExhausted}
				label={isSpendExhausted ? "Out of budget" : `${remainingScans} left today`}
				href={isScanBlocked ? "/account" : "/pricing"}
				tooltip={isScanBlocked ? "Pick up some coffee" : "Upgrade for more"}
			/>
		</div>
	)
}

// the brew trigger in its three states: running, blocked, or ready
function TopicScanTrigger({
	isScanRunning,
	isScanBlocked,
	isScanDisabled,
	isSpendExhausted,
	onManualScan,
}: {
	isScanRunning: boolean
	isScanBlocked: boolean
	isScanDisabled: boolean
	isSpendExhausted: boolean
	onManualScan: () => void
}) {
	// while a scan runs, the trigger becomes a bigger shimmering "Carl is reading", held at the button's height so
	// the row never jumps, and inset to end on the same line as the quota line below it
	if (isScanRunning) {
		return (
			<div className={cn(RAIL_TEXT_INSET, "flex min-h-11 items-center sm:min-h-9")}>
				<span className="shimmer-text text-base font-semibold sm:text-lg">Carl is reading…</span>
			</div>
		)
	}

	// if the scan blocked, the trigger stays live but leads to the account page instead of starting a scan
	if (isScanBlocked) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<AnchorLink href="/account" className={MENU_BUTTON_CLASS}>
						<Coffee className="size-4 fill-none" />
						Brew
					</AnchorLink>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{isSpendExhausted
						? "Out of budget this month. Pick up some coffee"
						: "Out of brews today. Pick up some coffee"}
				</TooltipContent>
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
					className={cn(MENU_BUTTON_CLASS, "disabled:pointer-events-none disabled:opacity-50")}
				>
					<Coffee className="size-4 fill-none" />
					Brew
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">Scan this topic for new findings</TooltipContent>
		</Tooltip>
	)
}
