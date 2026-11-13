import type { MonthlySpend } from "@carlnotes/contracts/activity"
import { SpendMeter as SharedSpendMeter, type SpendMeterElements } from "@carlnotes/core/components/SpendMeter"

export { toCutoffMarkers, toSpendMeterStatusLine } from "@carlnotes/core/lib/spendMeter"

import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { MeterBar } from "@/components/common/MeterBar"
import { MeterCutoffList } from "@/components/common/MeterCutoffList"
import { MeterMarker } from "@/components/common/MeterMarker"
import { TooltipSection } from "@/components/common/UpdateCountBadge"

/**
 * The progress bar of metered spend against the monthly budget, with its cutoff circles, legend, status line, and
 * cutoff list. An admin viewing another user's account sees no upgrade link.
 */
export function SpendMeter({ isReadOnly = false, ...props }: MonthlySpend & { isReadOnly?: boolean }) {
	return (
		<SharedSpendMeter
			{...props}
			upgradeLink={
				isReadOnly ? null : (
					<AnchorLink href={PLANS_PATH} className="sentence-link">
						{PURCHASE_COPY.pickUpSomeCoffee}
					</AnchorLink>
				)
			}
			elements={SPEND_METER_ELEMENTS}
		/>
	)
}

// the web's meter parts, with each circle's detail in a hover tooltip
const SPEND_METER_ELEMENTS: SpendMeterElements = {
	Root: ({ children }) => <div>{children}</div>,
	MeterBar,
	MeterMarker: ({ cutoffDetails, ...meterMarker }) => (
		<MeterMarker {...meterMarker}>
			<div className="space-y-1.5">
				{cutoffDetails.map(({ heading, tooltipLines }) => (
					<TooltipSection
						key={heading}
						heading={heading}
						tooltipLines={tooltipLines.map((line) => ({ key: line, line }))}
					/>
				))}
			</div>
		</MeterMarker>
	),
	Legend: ({ children }) => (
		<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{children}</div>
	),
	LegendItem: ({ colorClass, children }) => (
		<span className="flex max-w-full items-center gap-1.5">
			<span className={cn(colorClass, "size-2 shrink-0 rounded-full")} />
			<span>{children}</span>
		</span>
	),
	StatusLine: ({ children }) => <p className="text-muted-foreground mt-1 text-xs">{children}</p>,
	StatusPercent: ({ children }) => <span className="text-sm">{children}</span>,
	MeterCutoffList,
}
