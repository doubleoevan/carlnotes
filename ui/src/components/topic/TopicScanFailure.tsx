import { isBudgetError, toScanFailureLabel } from "@shared/scanFailure"
import { AnchorLink } from "@/components/common/AnchorLink"
import { buttonVariants } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

/**
 * Why a scan failed, followed by an Upgrade button when the budget is what stopped it.
 */
export function TopicScanFailure({ error }: { error: string | null }) {
	// the budget wall is the only failure a reader can act on, so it is the only one that offers a way out
	if (!isBudgetError(error)) {
		return <p className="text-destructive">{toScanFailureLabel(error)}</p>
	}
	return (
		<div className="text-destructive">
			<p>{toScanFailureLabel(error)}</p>
			{/* the call to action gets its own line, so the button does not break up the sentence above it */}
			<p className="mt-2">
				<AnchorLink href="/pricing" className={cn(buttonVariants({ size: "sm" }))}>
					Upgrade
				</AnchorLink>
				{" to keep the pot brewing"}
			</p>
		</div>
	)
}
