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
	const isBlocked = remainingScans !== null && (remainingScans <= 0 || isSpendExhausted)
	return (
		<div className="flex shrink-0 flex-col items-end gap-0.5">
			<TopicScanTrigger
				isRunning={isRunning}
				isBlocked={isBlocked}
				isDisabled={remainingScans === null}
				isSpendExhausted={isSpendExhausted}
				onManualScan={onManualScan}
			/>
			{/* the quota line hydrates in once the payload lands. blocked points at Activity like the trigger above,
			    otherwise the count still sells the upgrade */}
			<ScanQuotaLink
				isLoading={remainingScans === null}
				// an unlimited daily quota still says so, unless the month's budget is what ran out
				isUnlimited={remainingScans !== null && remainingScans >= ADMIN_QUOTA && !isSpendExhausted}
				label={isSpendExhausted ? "Out of budget" : `${remainingScans} left today`}
				href={isBlocked ? "/activity" : "/pricing"}
				tooltip={isBlocked ? "See your usage" : "Upgrade for more"}
			/>
		</div>
	)
}

// the brew trigger in its three states: running, blocked, or ready
function TopicScanTrigger({
	isRunning,
	isBlocked,
	isDisabled,
	isSpendExhausted,
	onManualScan,
}: {
	isRunning: boolean
	isBlocked: boolean
	isDisabled: boolean
	isSpendExhausted: boolean
	onManualScan: () => void
}) {
	// while a scan runs, the trigger becomes a bigger shimmering "Carl is reading", held at the button's height so
	// the row never jumps, and inset to end on the same line as the quota line below it
	if (isRunning) {
		return (
			<div className={cn(RAIL_TEXT_INSET, "flex min-h-11 items-center sm:min-h-9")}>
				<span className="shimmer-text text-base font-semibold sm:text-lg">Carl is reading…</span>
			</div>
		)
	}

	// blocked, the trigger stays live but leads to Activity instead of starting a brew that would be refused
	if (isBlocked) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<AnchorLink href="/activity" className={MENU_BUTTON_CLASS}>
						<Coffee className="size-4 fill-none" />
						Brew
					</AnchorLink>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{isSpendExhausted ? "Out of budget this month. See your usage" : "Out of brews today. See your usage"}
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
					disabled={isDisabled}
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
