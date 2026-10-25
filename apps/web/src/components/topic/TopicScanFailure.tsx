import { FIRST_SCAN_PAUSED_REASON, isBudgetError, toScanFailureLabel } from "@carlnotes/contracts/scanFailure"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { buttonVariants } from "@/components/primitives/button"

/**
 * Why a scan failed, followed by an Upgrade button if the budget is what stopped it, or a See account link if the
 * manual scans cutoff did.
 */
export function TopicScanFailure({ error }: { error: string | null }) {
	// the manual scans cutoff is a planned pause, so it reads plainly and links the account meter
	if (error === FIRST_SCAN_PAUSED_REASON) {
		return (
			<p className="text-muted-foreground">
				{toScanFailureLabel(error)}{" "}
				<AnchorLink href="/account" className="sentence-link">
					See account
				</AnchorLink>
			</p>
		)
	}

	// a budget failure is the only other one a user can act on, so it is the only other one that offers a way out
	if (!isBudgetError(error)) {
		return <p className="text-destructive">{toScanFailureLabel(error)}</p>
	}
	return (
		<div className="text-destructive">
			<p>{toScanFailureLabel(error)}</p>
			{/* the call to action gets its own line, below the sentence above it */}
			<p className="mt-2">
				<AnchorLink href="/plans" className={cn(buttonVariants({ size: "sm" }))}>
					Upgrade
				</AnchorLink>
				{" to keep the pot brewing"}
			</p>
		</div>
	)
}
