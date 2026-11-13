import type { MonthlySpend } from "@carlnotes/contracts/activity"
import { PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { SpendMeter as SharedSpendMeter, type SpendMeterElements } from "@carlnotes/core/components/SpendMeter"
import type { PurchaseOffers } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentProps } from "react"
import { Alert, Pressable, View } from "react-native"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { PlansLink } from "./PlansLink"

/**
 * Renders the web's spend meter with native views, each circle's detail in an alert on tap, and the plans link once the
 * budget is spent if the store sells the user a plan.
 */
export function SpendMeter({
	activity,
	canPurchase,
}: { activity: MonthlySpend } & Pick<PurchaseOffers, "canPurchase">) {
	return (
		<SharedSpendMeter
			{...activity}
			upgradeLink={canPurchase ? <PlansLink label={PURCHASE_COPY.pickUpSomeCoffee} className="text-xs" /> : null}
			elements={SPEND_METER_ELEMENTS}
		/>
	)
}

// the web's bar, circles, legend, and cutoff list as native views, with the bar announced as a progress bar
const SPEND_METER_ELEMENTS: SpendMeterElements = {
	Root: ({ children }) => <View className="w-full">{children}</View>,
	MeterBar: ({ segments, hasMarkers, progress, children }) => (
		<View className={cn("relative mt-2", hasMarkers && "pt-7.5")}>
			<View
				className="h-3 flex-row overflow-hidden rounded-full bg-muted"
				accessibilityRole="progressbar"
				accessibilityValue={{ min: 0, ...progress }}
			>
				{segments.map((segment) => (
					<View
						key={segment.key}
						className={cn("h-full", segment.colorClass)}
						style={{ width: `${segment.widthPercent}%` }}
					/>
				))}
			</View>
			{children}
		</View>
	),
	MeterMarker,
	Legend: ({ children }) => <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">{children}</View>,
	LegendItem: ({ colorClass, children }) => (
		<View className="max-w-full flex-row items-center gap-1.5">
			<View className={cn("size-2 shrink-0 rounded-full", colorClass)} />
			<Text className="shrink text-xs text-muted-foreground">{children}</Text>
		</View>
	),
	StatusLine: ({ children }) => <Text className="mt-1 text-xs text-muted-foreground">{children}</Text>,
	StatusPercent: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	MeterCutoffList: ({ cutoffRows }) => (
		<View className="mt-3 gap-1">
			{cutoffRows.map((cutoffRow) => (
				<View key={cutoffRow.key} className="flex-row items-baseline gap-2">
					<Text
						className={cn(
							"min-w-10 shrink-0 text-xs tabular-nums",
							cutoffRow.isPassed ? "text-muted-foreground" : "font-medium text-foreground",
						)}
					>
						{cutoffRow.label}
					</Text>
					<Text className={cn("flex-1 text-xs text-muted-foreground", cutoffRow.isPassed && "line-through")}>
						{cutoffRow.line}
					</Text>
				</View>
			))}
		</View>
	),
}

// one circle above the bar with its line down to the bar's bottom edge, a full touch target, and its detail on tap. a
// passed circle fades, and a moving one has a dashed edge
function MeterMarker({
	percent,
	label,
	ariaLabel,
	isPassed,
	isMoving,
	cutoffDetails,
}: ComponentProps<SpendMeterElements["MeterMarker"]>) {
	return (
		<View
			className="absolute top-0 bottom-0 items-center"
			style={{ left: `${percent}%`, transform: [{ translateX: -13 }] }}
		>
			<Pressable
				accessibilityRole="button"
				className={cn(
					"size-6.5 min-h-6.5 items-center justify-center rounded-full border-[1.5px] border-foreground bg-card",
					isMoving && "border-dashed",
					isPassed && "border-muted-foreground/50 bg-muted",
				)}
				hitSlop={toTouchTargetHitSlop(26)}
				accessibilityLabel={ariaLabel}
				onPress={() =>
					Alert.alert(
						cutoffDetails.map((cutoffDetail) => cutoffDetail.heading).join("\n"),
						cutoffDetails.flatMap((cutoffDetail) => cutoffDetail.tooltipLines).join("\n"),
					)
				}
			>
				<Text
					className={cn(
						"text-[9px] font-semibold tabular-nums",
						isPassed ? "text-muted-foreground" : "text-foreground",
					)}
				>
					{label}
				</Text>
			</Pressable>
			<View className={cn("-mt-px w-0.5 flex-1 bg-foreground", isPassed ? "opacity-35" : "opacity-75")} />
		</View>
	)
}
