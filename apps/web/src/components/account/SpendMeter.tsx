import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { CHAT_NAME } from "@carlnotes/contracts/chat"
import type { MonthlyBudgetCutoff } from "@carlnotes/contracts/plans"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { toCentsLabel, toSharePercent, toSharePercentLabel } from "@carlnotes/core/lib/labels"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TooltipSection } from "@/components/common/UpdateCountBadge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"
import { MONTHLY_BUDGET_CUTOFF_COPY, SPENT_BUDGET_LIST_LINE, toCutoffListLine } from "./monthlyBudgetCutoffCopy"

// messages for each percentage of the budget spent, lowest threshold last so the first match wins. a budget with
// cutoffs names its next cutoff instead, until every cutoff is passed
const BUDGET_MESSAGES = [
	{ budgetUsedPercent: 100, line: "Dry until the 1st. Carl is still reading. He just can't file notes." },
	{ budgetUsedPercent: 90, line: "Nearly out." },
	{ budgetUsedPercent: 60, line: "Getting low." },
	{ budgetUsedPercent: 0, line: "Full pot." },
] as const

// how close two cutoffs may sit, in percentage points, before they share one circle, so no circles overlap on a phone
const MIN_CIRCLE_GAP_PERCENT = 9

// one circle on the bar: where it sits, and the cutoffs it marks, lowest first
export type CutoffMarker = { percent: number; monthlyBudgetCutoffs: MonthlyBudgetCutoff[] }

// the share of the monthly budget spent, and the cutoffs it is measured against, lowest share first
type CutoffProgress = { budgetUsedShare: number; monthlyBudgetCutoffs: MonthlyBudgetCutoff[] }

// the spend and the monthly budget in cents, and the cutoffs the bar marks, lowest share first
type SpendMeterProps = Pick<
	ActivityResponse,
	"scanSpendCents" | "chatSpendCents" | "podcastEpisodeSpendCents" | "budgetCents" | "monthlyBudgetCutoffs"
>

/**
 * The progress bar of metered spend against the monthly budget, with scans, podcast episodes, and chat as segments of
 * one bar. Each cutoff is a circle above the bar with a line down through it, and a list under the bar says what each
 * one stops.
 */
export function SpendMeter({
	scanSpendCents,
	chatSpendCents,
	podcastEpisodeSpendCents,
	budgetCents,
	monthlyBudgetCutoffs,
}: SpendMeterProps) {
	// each segment's share of the budget, and the total the label reads
	const totalCents = scanSpendCents + chatSpendCents + podcastEpisodeSpendCents
	const toPercent = (cents: number) => (budgetCents > 0 ? Math.min(100, (cents / budgetCents) * 100) : 0)

	// the share of the budget spent, and the percent the status line reads
	const budgetUsedShare = budgetCents > 0 ? totalCents / budgetCents : 1
	const budgetUsedPercent = toSharePercent(Math.min(1, budgetUsedShare))
	const hasMonthlyBudgetCutoffs = monthlyBudgetCutoffs.length > 0

	// each spend segment in bar order, scans in the primary color, then podcast episodes, then chat
	const spendSegments = [
		{ key: "scans", colorClass: "bg-primary", label: "Brews", cents: scanSpendCents },
		{
			key: "podcastEpisodes",
			colorClass: "bg-spend-podcast-episode",
			label: PODCAST_NAME,
			cents: podcastEpisodeSpendCents,
		},
		{ key: "chat", colorClass: "bg-spend-chat", label: CHAT_NAME, cents: chatSpendCents },
	]

	return (
		<div>
			<div className="flex items-baseline justify-between">
				<h2 className="font-semibold">Carl's coffee fund</h2>
				<span className="text-muted-foreground text-sm">
					{toCentsLabel(totalCents)} of {toCentsLabel(budgetCents)}
				</span>
			</div>

			{/* the budget percentage segments under the cutoff circles */}
			<div className={cn("relative mt-2", hasMonthlyBudgetCutoffs && "pt-7.5")}>
				<div className="bg-muted flex h-3 overflow-hidden rounded-full">
					{spendSegments.map(({ key, colorClass, cents }) => (
						<div key={key} className={cn(colorClass, "h-full")} style={{ width: `${toPercent(cents)}%` }} />
					))}
				</div>
				{toCutoffMarkers(monthlyBudgetCutoffs).map((cutoffMarker) => (
					<CutoffMarkerCircle
						key={cutoffMarker.monthlyBudgetCutoffs[0]?.kind}
						cutoffMarker={cutoffMarker}
						budgetUsedShare={budgetUsedShare}
					/>
				))}
			</div>

			{/* the key to each budget percent segment. the podcast episode entry shows only if there is podcast episode
			    spend */}
			<div className="text-muted-foreground mt-2 flex gap-4 text-xs">
				{spendSegments
					.filter(({ key, cents }) => key !== "podcastEpisodes" || cents > 0)
					.map(({ key, colorClass, label, cents }) => (
						<span key={key} className="flex items-center gap-1.5">
							<span className={cn(colorClass, "size-2 rounded-full")} />
							{`${label} ${toCentsLabel(cents)}`}
						</span>
					))}
			</div>

			{/* the budget percent and the status line, with the upgrade link once the budget is spent */}
			<p className="text-muted-foreground mt-1 text-xs">
				<span className="text-sm">{budgetUsedPercent}%</span>{" "}
				{toSpendMeterStatusLine({ budgetUsedShare, monthlyBudgetCutoffs })}
				{budgetUsedPercent >= 100 && (
					<>
						{" "}
						<AnchorLink href="/plans" className="underline">
							Pick up some coffee.
						</AnchorLink>
					</>
				)}
			</p>
			{hasMonthlyBudgetCutoffs && (
				<MonthlyBudgetCutoffList monthlyBudgetCutoffs={monthlyBudgetCutoffs} budgetUsedShare={budgetUsedShare} />
			)}
		</div>
	)
}

/**
 * Returns the circles that mark the cutoffs on the bar, lowest first. A cutoff that sits closer than
 * MIN_CIRCLE_GAP_PERCENT to the circle before it shares that circle.
 */
export function toCutoffMarkers(monthlyBudgetCutoffs: MonthlyBudgetCutoff[]): CutoffMarker[] {
	const cutoffMarkers: CutoffMarker[] = []
	for (const monthlyBudgetCutoff of monthlyBudgetCutoffs) {
		// join the circle before it if the two would overlap, or start a circle of its own
		const percent = toSharePercent(monthlyBudgetCutoff.budgetShare)
		const previousCutoffMarker = cutoffMarkers.at(-1)
		if (previousCutoffMarker && percent - previousCutoffMarker.percent < MIN_CIRCLE_GAP_PERCENT) {
			previousCutoffMarker.monthlyBudgetCutoffs.push(monthlyBudgetCutoff)
		} else {
			cutoffMarkers.push({ percent, monthlyBudgetCutoffs: [monthlyBudgetCutoff] })
		}
	}
	return cutoffMarkers
}

/**
 * Returns the status line under the bar: the spent line at 100%, the next cutoff while one is ahead, and otherwise the
 * message for the share spent.
 */
export function toSpendMeterStatusLine({ budgetUsedShare, monthlyBudgetCutoffs }: CutoffProgress): string {
	// the next cutoff, if the budget is not spent and one is still ahead
	const nextMonthlyBudgetCutoff = monthlyBudgetCutoffs.find((cutoff) => budgetUsedShare < cutoff.budgetShare)
	if (budgetUsedShare < 1 && nextMonthlyBudgetCutoff) {
		return `Next at ${toCutoffClause(nextMonthlyBudgetCutoff)}.`
	}

	// the message for the share spent
	const budgetUsedPercent = toSharePercent(Math.min(1, budgetUsedShare))
	const budgetMessage =
		BUDGET_MESSAGES.find((message) => budgetUsedPercent >= message.budgetUsedPercent) ?? BUDGET_MESSAGES[0]
	return budgetMessage.line
}

// a cutoff's percent and its line as one clause, as in "60%: new podcast episodes pause"
function toCutoffClause(monthlyBudgetCutoff: MonthlyBudgetCutoff): string {
	const { line } = MONTHLY_BUDGET_CUTOFF_COPY[monthlyBudgetCutoff.kind]
	return `${toSharePercentLabel(monthlyBudgetCutoff.budgetShare)}: ${line.charAt(0).toLowerCase()}${line.slice(1)}`
}

// one circle above the bar, with its line down to the bar's bottom edge and a tooltip that says what each of its
// cutoffs stops. a passed circle fades, and the daily scans cutoff, which moves each day, has a dashed edge
function CutoffMarkerCircle({
	cutoffMarker,
	budgetUsedShare,
}: {
	cutoffMarker: CutoffMarker
	budgetUsedShare: number
}) {
	// the circle reads as passed once its first cutoff is, and as moving if it marks the daily scans cutoff alone
	const { percent, monthlyBudgetCutoffs } = cutoffMarker
	const isCutoffMarkerPassed = budgetUsedShare >= (monthlyBudgetCutoffs[0]?.budgetShare ?? 1)
	const isCutoffMarkerMoving = monthlyBudgetCutoffs.every((cutoff) => cutoff.kind === "dailyScans")
	const cutoffHeadings = monthlyBudgetCutoffs.map((cutoff) => `At ${toCutoffClause(cutoff)}`)

	return (
		<div
			className="absolute top-0 bottom-0 flex -translate-x-1/2 flex-col items-center"
			style={{ left: `${percent}%` }}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={cutoffHeadings.join(". ")}
						className={cn(
							"border-foreground bg-card text-foreground grid size-6.5 shrink-0 place-items-center rounded-full border-[1.5px] text-[9px] font-semibold tabular-nums",
							isCutoffMarkerMoving && "border-dashed",
							isCutoffMarkerPassed && "bg-muted opacity-45",
						)}
					>
						{percent}%
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-60">
					<div className="space-y-1.5">
						{monthlyBudgetCutoffs.map((cutoff, i) => (
							<TooltipSection
								key={cutoff.kind}
								heading={cutoffHeadings[i]}
								tooltipLines={MONTHLY_BUDGET_CUTOFF_COPY[cutoff.kind].tooltipLines.map((line) => ({ key: line, line }))}
							/>
						))}
					</div>
				</TooltipContent>
			</Tooltip>
			<div className={cn("bg-foreground -mt-px w-0.5 flex-1", isCutoffMarkerPassed ? "opacity-35" : "opacity-75")} />
		</div>
	)
}

// the list under the bar of what each cutoff stops, ending with the spent budget. a passed line is struck through
function MonthlyBudgetCutoffList({ monthlyBudgetCutoffs, budgetUsedShare }: CutoffProgress) {
	// each cutoff's line, then the spent budget's
	const listRows = [
		...monthlyBudgetCutoffs.map((cutoff) => ({
			key: cutoff.kind,
			budgetShare: cutoff.budgetShare,
			line: toCutoffListLine(cutoff.kind),
		})),
		{ key: "spent", budgetShare: 1, line: SPENT_BUDGET_LIST_LINE },
	]

	return (
		<ul className="text-muted-foreground mt-3 space-y-1 text-xs">
			{listRows.map((listRow) => {
				const isCutoffListRowPassed = budgetUsedShare >= listRow.budgetShare
				return (
					<li key={listRow.key} className="flex gap-2">
						<span className={cn("w-10 shrink-0 tabular-nums", !isCutoffListRowPassed && "text-foreground font-medium")}>
							{toSharePercentLabel(listRow.budgetShare)}
						</span>
						<span className={cn(isCutoffListRowPassed && "line-through")}>{listRow.line}</span>
					</li>
				)
			})}
		</ul>
	)
}
