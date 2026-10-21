import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

/**
 * How much of the scan quota is left, linking to the sign-in page for a visitor or the plans page for a logged-in user.
 * Shows a skeleton until the count loads, or "Unlimited" for an admin.
 */
export function ScanQuotaLink({
	isLoading,
	isUnlimited,
	label,
	href,
	tooltip,
}: {
	isLoading: boolean
	isUnlimited: boolean
	label: string
	href: string
	tooltip: string
}) {
	// the count has not loaded yet, so the skeleton holds its line height
	if (isLoading) {
		return <div aria-hidden="true" className="bg-muted mr-2.5 h-4 w-16 animate-pulse rounded" />
	}
	if (isUnlimited) {
		return <span className="text-muted-foreground animate-hydrate mr-2.5 text-xs">Unlimited</span>
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href={href} className="text-link animate-hydrate mr-2.5 text-xs hover:underline">
					{label}
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltip}</TooltipContent>
		</Tooltip>
	)
}
