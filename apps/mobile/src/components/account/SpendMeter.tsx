import { toCentsLabel, toSharePercentLabel } from "@carlnotes/core/lib/labels"
import { MONTHLY_BUDGET_CUTOFF_COPY } from "@carlnotes/core/lib/monthlyBudgetCutoffCopy"
import {
	type CutoffMarker,
	type SpendMeterProps,
	toCutoffClause,
	toCutoffMarkerState,
	toCutoffMarkers,
	toSpendMeterModel,
	toSpendMeterStatusLine,
} from "@carlnotes/core/lib/spendMeter"
import { cn } from "@carlnotes/nightshift/classNames"
import { Alert, Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

/**
 * Draws the shared budget calculations and cutoff markers using native views and accessible detail buttons.
 */
export function SpendMeter({ activity }: { activity: SpendMeterProps }) {
	// read the shared amounts, segments, legend, and upgrade visibility
	const { budgetCents, monthlyBudgetCutoffs } = activity
	const {
		totalCents,
		budgetUsedShare,
		budgetUsedPercent,
		hasMonthlyBudgetCutoffs,
		isUpgradeVisible,
		spendSegments,
		legendSegments,
		cutoffRows,
	} = toSpendMeterModel(activity)
	return (
		<View className="w-full">
			<View className="flex-row flex-wrap items-baseline justify-between gap-2">
				<Text className="font-semibold">{"Carl's coffee fund"}</Text>
				<Text className="text-sm text-muted-foreground">
					{toCentsLabel(totalCents)} of {toCentsLabel(budgetCents)}
				</Text>
			</View>
			{/* cutoff buttons open the web tooltip's content on tap */}
			<View className={cn("relative mt-2", hasMonthlyBudgetCutoffs && "pt-7.5")}>
				<View
					className="h-3 flex-row overflow-hidden rounded-full bg-muted"
					accessibilityRole="progressbar"
					accessibilityValue={{
						min: 0,
						max: budgetCents,
						now: Math.min(totalCents, budgetCents),
						text: `${toCentsLabel(totalCents)} of ${toCentsLabel(budgetCents)}`,
					}}
				>
					{spendSegments.map((segment) => (
						<View
							key={segment.key}
							className={cn("h-full", segment.colorClass)}
							style={{ width: `${segment.widthPercent}%` }}
						/>
					))}
				</View>
				{toCutoffMarkers(monthlyBudgetCutoffs).map((marker) => (
					<CutoffMarkerCircle key={marker.percent} marker={marker} budgetUsedShare={budgetUsedShare} />
				))}
			</View>
			<View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
				{legendSegments.map((segment) => (
					<View key={segment.key} className="max-w-full flex-row items-center gap-1.5">
						<View className={cn("size-2 shrink-0 rounded-full", segment.colorClass)} />
						<Text className="shrink text-xs text-muted-foreground">
							{segment.label} {toCentsLabel(segment.cents)}
						</Text>
					</View>
				))}
			</View>
			<Text className="mt-1 text-xs text-muted-foreground">
				{budgetUsedPercent}% {toSpendMeterStatusLine({ budgetUsedShare, monthlyBudgetCutoffs })}
			</Text>
			{isUpgradeVisible && (
				<AnchorLink href="/plans" accessibilityLabel="Pick up some coffee" className="min-h-11 justify-center">
					<Text className="text-link">Pick up some coffee.</Text>
				</AnchorLink>
			)}
			{hasMonthlyBudgetCutoffs && (
				<View className="mt-3 gap-1">
					{cutoffRows.map((row) => (
						<View key={row.key} className="flex-row gap-2">
							<Text
								className={cn(
									"w-10 text-xs tabular-nums",
									budgetUsedShare < row.budgetShare ? "font-medium" : "text-muted-foreground",
								)}
							>
								{toSharePercentLabel(row.budgetShare)}
							</Text>
							<Text
								className={cn(
									"flex-1 text-xs text-muted-foreground",
									budgetUsedShare >= row.budgetShare && "line-through",
								)}
							>
								{row.line}
							</Text>
						</View>
					))}
				</View>
			)}
		</View>
	)
}

// show the web checkpoint states with native tap details and a full touch target
function CutoffMarkerCircle({ marker, budgetUsedShare }: { marker: CutoffMarker; budgetUsedShare: number }) {
	const { percent, monthlyBudgetCutoffs } = marker
	const { isCutoffMarkerPassed, isCutoffMarkerMoving } = toCutoffMarkerState({ monthlyBudgetCutoffs, budgetUsedShare })
	const headings = monthlyBudgetCutoffs.map((cutoff) => `At ${toCutoffClause(cutoff)}`)
	return (
		<View
			className="absolute top-0 bottom-0 items-center"
			style={{ left: `${percent}%`, transform: [{ translateX: -13 }] }}
		>
			<Pressable
				accessibilityRole="button"
				className={cn(
					"size-6.5 min-h-6.5 items-center justify-center rounded-full border-[1.5px] border-foreground bg-card",
					isCutoffMarkerMoving && "border-dashed",
					isCutoffMarkerPassed && "border-muted-foreground/50 bg-muted",
				)}
				hitSlop={toTouchTargetHitSlop(26)}
				accessibilityLabel={headings.join(". ")}
				onPress={() =>
					Alert.alert(
						headings.join("\n"),
						monthlyBudgetCutoffs.flatMap((cutoff) => MONTHLY_BUDGET_CUTOFF_COPY[cutoff.kind].tooltipLines).join("\n"),
					)
				}
			>
				<Text
					className={cn(
						"text-[9px] font-semibold tabular-nums",
						isCutoffMarkerPassed ? "text-muted-foreground" : "text-foreground",
					)}
				>
					{percent}%
				</Text>
			</Pressable>
			<View className={cn("-mt-px w-0.5 flex-1 bg-foreground", isCutoffMarkerPassed ? "opacity-35" : "opacity-75")} />
		</View>
	)
}
